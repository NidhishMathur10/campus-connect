"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CONCERN_ACTOR_NAMES,
  CONCERN_CATEGORIES,
  CONCERN_DEPARTMENT,
  CONCERN_MAX_PER_TEACHER_TERM,
  CONCERN_TICKET_CATEGORY,
  currentTerm,
  IMMEDIATE_DEAN_CATEGORIES,
  MODERATION_MESSAGES_FEEDBACK,
  SAFETY_CONCERN_CATEGORY,
  type ConcernCategory,
} from "@/config/feedback";
import { PRIORITY_SLA_HOURS } from "@/config/routing";
import { DOUBT_SUBJECTS } from "@/config/subjects";
import { moderateFeedbackText } from "@/lib/ai/feedback";
import { getCurrentProfile } from "@/lib/auth";
import { notifyConcernFiled, notifyConcernStudent } from "@/lib/email/concern-notify";
import { notifyTicketCreated } from "@/lib/email/notify";
import { createSafetyEscalation } from "@/lib/escalations";
import { deleteStoredPhoto } from "@/lib/moderation";
import { downloadComplaintPhoto, photoPublicUrl } from "@/lib/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeedbackResult } from "@/lib/feedback/types";
import type { Profile } from "@/lib/types";
import { escalateConcern } from "./escalate";
import { CONCERN_VIEW_ROLES } from "./queries";

/**
 * Formal concerns about a teacher (CLAUDE.md §22). The ticket is confidential, academic and held by the HOD.
 * The reporter's id is stored (tickets.reporter_id, teacher_concern_identity) but no page or API ever returns it.
 */
export type ConcernResult = FeedbackResult | { ok: true; ticketNo: string; routed: "hod" | "safety"; escalated: boolean };

const SYSTEM = { actor_id: null, actor_name: "CampusConnect", actor_role: null } as const;

const ConcernSchema = z.object({
  teacherId: z.uuid(),
  subject: z.enum(DOUBT_SUBJECTS as [string, ...string[]], "Choose a subject."),
  category: z.enum(CONCERN_CATEGORIES, "Choose what this is about."),
  text: z.string().trim().min(20, "Please describe what happened (at least 20 characters).").max(3000),
  when: z.string().trim().min(2, "Tell us when it happened.").max(200),
  photoPath: z.string().max(300).nullable().optional(),
});

export async function submitConcern(input: z.input<typeof ConcernSchema>): Promise<ConcernResult> {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "student") return { ok: false, error: "Only students can report a concern." };
  const parsed = ConcernSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  const { teacherId, subject, category, text, when, photoPath } = parsed.data;
  if (photoPath && !photoPath.startsWith(`${profile.id}/`)) return { ok: false, error: "That photo doesn't belong to you." };

  const admin = createAdminClient();
  const term = currentTerm();
  const { data: teacher } = await admin.from("profiles").select("id, full_name, subjects").eq("id", teacherId).eq("role", "teacher").maybeSingle();
  if (!teacher || !((teacher.subjects as string[] | null) ?? []).includes(subject)) {
    return { ok: false, error: "That teacher doesn't teach this subject." };
  }

  const { count: already } = await admin
    .from("teacher_concern_identity")
    .select("concern_id", { count: "exact", head: true })
    .eq("reporter_id", profile.id)
    .eq("teacher_id", teacherId)
    .eq("term", term);
  if ((already ?? 0) >= CONCERN_MAX_PER_TEACHER_TERM) {
    return { ok: false, error: `You can file at most ${CONCERN_MAX_PER_TEACHER_TERM} concerns about the same teacher per term. Please wait for the HOD's reply to the earlier ones.` };
  }

  // One Gemini call: moderation + neutral summary (+ the evidence photo, when there is one).
  const photo = photoPath ? await downloadComplaintPhoto(photoPath) : null;
  const mod = await moderateFeedbackText({
    kind: "concern",
    text,
    context: `Concern about a teacher (${subject}). Category chosen by the student: ${category}. When: ${when}.`,
    photo,
  });
  if (photoPath && photo && !mod.unchecked && !mod.photo_ok) {
    await deleteStoredPhoto(photoPath);
    return { ok: false, level: "photo", error: "This photo can't be used as evidence, so it was removed. You can still submit without it." };
  }
  if (mod.level === "rephrase") return { ok: false, level: "rephrase", error: MODERATION_MESSAGES_FEEDBACK.concernRephrase };
  if (mod.level === "needs_facts") return { ok: false, level: "needs_facts", error: MODERATION_MESSAGES_FEEDBACK.needsFacts };
  if (mod.level === "block") return { ok: false, level: "block", error: mod.reason || MODERATION_MESSAGES_FEEDBACK.block };

  const summary = mod.neutral_summary ?? `Concern about ${subject} (${category}).`;
  const photoUrl = photoPath ? photoPublicUrl(photoPath) : null;

  // Harassment / sexual misconduct: the existing confidential Safety module (Dean + Anti-Ragging Committee), not the HOD.
  if (category === SAFETY_CONCERN_CATEGORY || mod.is_misconduct) {
    return fileAsSafetyReport({ profile, teacherName: teacher.full_name, subject, category, text, when, summary, photoUrl, unchecked: mod.unchecked });
  }

  const priority = category === "Discrimination" ? "High" : "Medium";
  const { data: ticket, error } = await admin
    .from("tickets")
    .insert({
      module: "academic",
      reporter_id: profile.id,
      original_text: text,
      language: "en",
      title: `Concern: ${category} (${subject})`.slice(0, 120),
      summary,
      category: CONCERN_TICKET_CATEGORY,
      department: CONCERN_DEPARTMENT,
      priority,
      ai_meta: { model: "feedback-moderation", moderation: mod.unchecked ? "unchecked" : "passed", manual_entry: true },
      photo_url: photoUrl,
      is_confidential: true,
      hide_identity: true,
      teacher_complaint: true,
      status: "Submitted",
      // No SLA clock: the 72h acknowledgement rule is handled by escalateStaleConcerns.
      sla_due_at: null,
    })
    .select("id, ticket_no")
    .single();
  if (error || !ticket) {
    console.error("[submitConcern] ticket", error?.message);
    return { ok: false, error: "Could not save your concern. Please try again." };
  }
  const { data: concern, error: cErr } = await admin
    .from("teacher_concerns")
    .insert({
      ticket_id: ticket.id,
      teacher_id: teacherId,
      subject,
      term,
      concern_category: category,
      happened_when: when,
      neutral_summary: mod.neutral_summary,
      moderation: mod.unchecked ? "unchecked" : "passed",
    })
    .select("id")
    .single();
  if (cErr || !concern) {
    console.error("[submitConcern] concern", cErr?.message);
    await admin.from("tickets").delete().eq("id", ticket.id);
    return { ok: false, error: "Could not save your concern. Please try again." };
  }
  await admin.from("teacher_concern_identity").insert({ concern_id: concern.id, reporter_id: profile.id, teacher_id: teacherId, term });
  await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    ...SYSTEM,
    type: "created",
    to_status: "Submitted",
    note: "Your concern was received. It is anonymous: the teacher will never see it, and your name is not shown to anyone.",
  });

  let escalated = false;
  if (IMMEDIATE_DEAN_CATEGORIES.includes(category as ConcernCategory)) escalated = await escalateConcern(concern.id, "discrimination");
  notifyConcernFiled(ticket.ticket_no, category);
  notifyConcernStudent(profile.id, ticket.ticket_no, `We received your concern ${ticket.ticket_no}`, "Your report is anonymous. The Head of Department has been asked to look into it. We will tell you here when something changes.");
  revalidatePath("/tickets");
  revalidatePath("/concerns");
  return { ok: true, ticketNo: ticket.ticket_no, routed: "hod", escalated };
}

async function fileAsSafetyReport(a: {
  profile: Profile;
  teacherName: string;
  subject: string;
  category: string;
  text: string;
  when: string;
  summary: string;
  photoUrl: string | null;
  unchecked: boolean;
}): Promise<ConcernResult> {
  const admin = createAdminClient();
  const { data: ticket, error } = await admin
    .from("tickets")
    .insert({
      module: "security",
      reporter_id: a.profile.id,
      original_text: `About a teacher: ${a.teacherName} (${a.subject}). When: ${a.when}.\n\n${a.text}`,
      language: "en",
      title: "Confidential report about a teacher",
      summary: a.summary,
      category: "Harassment / Bullying",
      department: "Anti-Ragging Committee",
      priority: "Urgent",
      ai_meta: { model: "feedback-moderation", moderation: a.unchecked ? "unchecked" : "passed", manual_entry: true, photo_has_people: !!a.photoUrl },
      photo_url: a.photoUrl,
      is_confidential: true,
      hide_identity: true,
      status: "Submitted",
      sla_due_at: new Date(Date.now() + PRIORITY_SLA_HOURS.Urgent * 3_600_000).toISOString(),
    })
    .select("id, ticket_no")
    .single();
  if (error || !ticket) {
    console.error("[submitConcern] safety ticket", error?.message);
    return { ok: false, error: "Could not save your report. Please try again." };
  }
  await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    ...SYSTEM,
    type: "created",
    to_status: "Submitted",
    note: "Reported via Safety & Security (confidential). Only the Anti-Ragging Committee and the Dean can see it.",
  });
  await createSafetyEscalation({ id: ticket.id, category: "Harassment / Bullying", title: "Confidential report about a teacher" });
  notifyTicketCreated(ticket.id);
  revalidatePath("/tickets");
  return { ok: true, ticketNo: ticket.ticket_no, routed: "safety", escalated: true };
}

// ---------------------------------------------------------------------------
// HOD / Dean: acknowledge, update, close, escalate
// ---------------------------------------------------------------------------
type StaffResult = { ok: true } | { ok: false; error: string };

async function requireReviewer() {
  const { profile } = await getCurrentProfile();
  return profile && CONCERN_VIEW_ROLES.includes(profile.role) ? profile : null;
}

async function loadConcern(ticketNo: string) {
  const { data: ticket } = await createAdminClient()
    .from("tickets")
    .select("id, ticket_no, status, reporter_id")
    .eq("ticket_no", ticketNo)
    .eq("teacher_complaint", true)
    .maybeSingle();
  if (!ticket) return null;
  const { data: concern } = await createAdminClient().from("teacher_concerns").select("id, acknowledged_at").eq("ticket_id", ticket.id).maybeSingle();
  return concern ? { ticket, concern } : null;
}

const actorOf = (p: Profile) => ({
  actor_id: p.id,
  actor_name: p.role === "dean" ? CONCERN_ACTOR_NAMES.dean : CONCERN_ACTOR_NAMES.hod,
  actor_role: p.role,
});

function refresh(ticketNo: string) {
  revalidatePath("/concerns");
  revalidatePath(`/concerns/${ticketNo}`);
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketNo}`);
}

export async function acknowledgeConcern(ticketNo: string): Promise<StaffResult> {
  const profile = await requireReviewer();
  if (!profile) return { ok: false, error: "Only the HOD or Dean can do this." };
  const found = await loadConcern(ticketNo);
  if (!found) return { ok: false, error: "That concern isn't available." };
  if (found.concern.acknowledged_at) return { ok: true };
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("teacher_concerns")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", found.concern.id)
    .is("acknowledged_at", null)
    .select("id");
  if (!claimed?.length) return { ok: true };
  await admin.from("tickets").update({ status: "Assigned" }).eq("id", found.ticket.id);
  await admin.from("ticket_events").insert({
    ticket_id: found.ticket.id,
    ...actorOf(profile),
    type: "status_change",
    from_status: found.ticket.status,
    to_status: "Assigned",
    note: "Your concern has been acknowledged and is being looked into.",
  });
  notifyConcernStudent(found.ticket.reporter_id, ticketNo, `Your concern ${ticketNo} was acknowledged`, "The concern has been seen and is being looked into.", { inApp: false });
  refresh(ticketNo);
  return { ok: true };
}

const UpdateSchema = z.object({
  ticketNo: z.string().regex(/^CC-\d+$/),
  note: z.string().trim().min(3, "Write a short note.").max(1500),
  /** Shown to the student (otherwise an internal note for the HOD / Dean). */
  visibleToStudent: z.boolean(),
  /** Close the concern with this note as the outcome (must be visible to the student). */
  close: z.boolean().default(false),
});

export async function updateConcern(input: z.input<typeof UpdateSchema>): Promise<StaffResult> {
  const profile = await requireReviewer();
  if (!profile) return { ok: false, error: "Only the HOD or Dean can do this." };
  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the note." };
  const { ticketNo, note, visibleToStudent, close } = parsed.data;
  if (close && !visibleToStudent) return { ok: false, error: "Closing needs a note the student can read." };
  const found = await loadConcern(ticketNo);
  if (!found) return { ok: false, error: "That concern isn't available." };
  if (found.ticket.status === "Closed") return { ok: false, error: "This concern is already closed." };

  const admin = createAdminClient();
  const from = found.ticket.status;
  // First visible reply: acknowledge it at the same time.
  if (!found.concern.acknowledged_at) {
    await admin.from("teacher_concerns").update({ acknowledged_at: new Date().toISOString() }).eq("id", found.concern.id).is("acknowledged_at", null);
  }
  const to = close ? "Closed" : visibleToStudent && (from === "Submitted" || from === "Assigned") ? "In Progress" : from;
  if (to !== from) await admin.from("tickets").update({ status: to, ...(close ? { resolved_at: new Date().toISOString() } : {}) }).eq("id", found.ticket.id);
  await admin.from("ticket_events").insert({
    ticket_id: found.ticket.id,
    ...actorOf(profile),
    type: to !== from ? "status_change" : "note",
    from_status: to !== from ? from : null,
    to_status: to !== from ? to : null,
    note,
    is_internal: !visibleToStudent,
  });
  if (visibleToStudent) {
    notifyConcernStudent(found.ticket.reporter_id, ticketNo, close ? `Your concern ${ticketNo} was closed` : `Update on your concern ${ticketNo}`, note, { inApp: to === from });
  }
  refresh(ticketNo);
  return { ok: true };
}

export async function escalateConcernManually(ticketNo: string): Promise<StaffResult> {
  const profile = await requireReviewer();
  if (profile?.role !== "hod") return { ok: false, error: "Only the HOD can escalate to the Dean." };
  const found = await loadConcern(ticketNo);
  if (!found) return { ok: false, error: "That concern isn't available." };
  await escalateConcern(found.concern.id, "manual");
  refresh(ticketNo);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dean: reveal the reporter (concerns only, never ratings), with a reason, audited
// ---------------------------------------------------------------------------
export type RevealResult = { ok: true; name: string; rollNo: string | null } | { ok: false; error: string };

export async function revealIdentity(ticketNo: string, reason: string): Promise<RevealResult> {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "dean") return { ok: false, error: "Only the Dean can reveal a reporter." };
  const why = reason.trim();
  if (why.length < 15) return { ok: false, error: "Write the reason for the investigation (at least 15 characters)." };
  if (why.length > 1000) return { ok: false, error: "Keep the reason under 1000 characters." };
  const found = await loadConcern(ticketNo);
  if (!found) return { ok: false, error: "That concern isn't available." };

  const admin = createAdminClient();
  const { data: identity } = await admin.from("teacher_concern_identity").select("reporter_id").eq("concern_id", found.concern.id).maybeSingle();
  if (!identity) return { ok: false, error: "The reporter could not be found." };

  // The audit entry is written FIRST: no log, no reveal.
  const { error: logErr } = await admin.from("identity_reveal_log").insert({
    ticket_id: found.ticket.id,
    ticket_no: ticketNo,
    revealed_by: profile.id,
    revealer_name: profile.full_name,
    reason: why,
  });
  if (logErr) {
    console.error("[revealIdentity] log", logErr.message);
    return { ok: false, error: "Could not write the audit log, so the identity was not revealed." };
  }
  const { data: person } = await admin.from("profiles").select("full_name, roll_no").eq("id", identity.reporter_id).maybeSingle();
  revalidatePath("/audit");
  return person ? { ok: true, name: person.full_name, rollNo: person.roll_no } : { ok: false, error: "The reporter's profile no longer exists." };
}
