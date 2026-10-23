"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normaliseRoom, TICKET_SCOPES } from "@/config/locations";
import {
  categoriesFor,
  computeSlaDueAt,
  getRoutingRule,
  isConfidentialCategory,
  MODULE_LABELS,
  PRIORITIES,
  type Department,
} from "@/config/routing";
import { CONFIDENTIAL_REPORTER } from "@/config/safety";
import { DUPLICATE_FLAG_THRESHOLD } from "@/config/statuses";
import { isFaculty } from "@/config/faculty";
import { getCurrentProfile } from "@/lib/auth";
import { notifyTicketCreated } from "@/lib/email/notify";
import { checkEscalations, createSafetyEscalation } from "@/lib/escalations";
import { photoPublicUrl } from "@/lib/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Ticket } from "@/lib/types";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const AI_ACTOR = { actor_id: null, actor_name: "CampusConnect AI", actor_role: null };

/** Students and faculty (teacher / HOD / academic office) can report, follow and confirm tickets. */
async function requireReporter(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && (profile.role === "student" || isFaculty(profile.role)) ? profile : null;
}

/** Where the reporter tracks their tickets. */
function myTicketsPath(p: Pick<Profile, "role">): string {
  return isFaculty(p.role) ? "/reports" : "/tickets";
}

function actor(p: Profile, hideName = false) {
  return { actor_id: p.id, actor_name: hideName ? CONFIDENTIAL_REPORTER : p.full_name, actor_role: p.role };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
const CreateTicketSchema = z.object({
  module: z.enum(["hostel", "academic", "security"]),
  original_text: z.string().trim().min(3).max(2000),
  language: z.string().max(10).default("en"),
  english_text: z.string().max(4000).nullable(),
  title: z.string().trim().min(2).max(120),
  summary: z.string().max(1500).nullable(),
  category: z.string(),
  department: z.string().nullable(),
  priority: z.enum(PRIORITIES),
  is_safety_hazard: z.boolean(),
  location: z.object({
    building: z.string().nullable(),
    floor: z.string().nullable(),
    room_no: z.string().max(20).nullable(),
    spot: z.string().max(120).nullable(),
    machine_id: z.string().nullable(),
  }),
  /** Hostel: how many rooms the issue affects (null = not applicable). */
  scope: z.enum(TICKET_SCOPES).nullable().default(null),
  photo_path: z.string().max(300).nullable(),
  photo_analysis: z
    .object({ observed: z.string(), matches_complaint: z.boolean(), notes: z.string() })
    .nullable(),
  details_incomplete: z.boolean(),
  /** Safety & Security: student's choice for "Other safety concern" (other categories are fixed). */
  confidential_choice: z.boolean().default(false),
  /** Safety & Security: "Hide my name from the investigating staff" (confidential tickets only). */
  hide_identity: z.boolean().default(false),
  is_emergency: z.boolean().default(false),
  /** "passed" = text (and photo) were moderated by the AI; "unchecked" = AI unavailable, staff see "Not moderated". */
  moderation: z.enum(["passed", "unchecked"]).default("unchecked"),
  /** Safety & Security: the photo shows people, so only arc / dean may view it. */
  photo_has_people: z.boolean().default(false),
  /** Null when the AI was unavailable and the student filled the ticket by hand. */
  ai: z
    .object({
      model: z.string(),
      extracted_issue: z.string(),
      confidence: z.record(z.string(), z.number()),
      reasons: z.record(z.string(), z.string()),
      missing_fields: z.array(z.string()),
      follow_up: z.object({ questions: z.array(z.string()), answer: z.string() }).nullable(),
      ai_category: z.string(),
    })
    .nullable(),
  duplicate: z
    .object({ ticket_id: z.uuid(), similarity: z.number().min(0).max(1), reason: z.string() })
    .nullable(),
  /** Which path the pre-submit duplicate check took (kept in ai_meta). Null if it never ran. */
  duplicate_check: z
    .object({ method: z.enum(["gemini", "keyword"]), model: z.string().nullable() })
    .nullable()
    .default(null),
});
export type CreateTicketInput = z.input<typeof CreateTicketSchema>;

export async function createTicket(
  input: CreateTicketInput,
): Promise<ActionResult<{ id: string; ticket_no: string }>> {
  const profile = await requireReporter();
  if (!profile) return { ok: false, error: "Only students and faculty can report issues. Please log in again." };

  const parsed = CreateTicketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const t = parsed.data;

  const faculty = isFaculty(profile.role);
  // Hostel and Safety & Security reports stay student-only.
  if (faculty && t.module !== "academic") {
    return { ok: false, error: "Faculty can report academic and campus issues only." };
  }
  if (!(categoriesFor(t.module, faculty ? "faculty" : "student") as readonly string[]).includes(t.category)) {
    return { ok: false, error: "Please choose a valid category." };
  }
  const rule = getRoutingRule(t.module, t.category);
  const department: Department = rule.departments.includes(t.department as Department)
    ? (t.department as Department)
    : rule.departments[0];
  const isSecurity = t.module === "security";
  // Safety reports always use the guide's priority (the student can't lower it).
  const priority = isSecurity
    ? t.is_emergency
      ? "Urgent"
      : rule.defaultPriority
    : t.is_safety_hazard
      ? "Urgent"
      : t.priority;
  // Hostel room number, normalised ("room 204" -> "204"). A ticket with a room defaults to room scope.
  const roomNo = t.module === "hostel" ? normaliseRoom(t.location.room_no) : null;
  const isConfidential = isSecurity && isConfidentialCategory(t.category, t.confidential_choice);
  const hideIdentity = isConfidential && t.hide_identity;

  let photoUrl: string | null = null;
  if (t.photo_path) {
    if (!t.photo_path.startsWith(`${profile.id}/`)) return { ok: false, error: "Invalid photo." };
    photoUrl = photoPublicUrl(t.photo_path);
  }

  const admin = createAdminClient();

  let dup: { id: string; score: number; reason: string } | null = null;
  // Safety reports never take part in duplicate detection.
  if (!isSecurity && t.duplicate && t.duplicate.similarity >= DUPLICATE_FLAG_THRESHOLD) {
    const { data } = await admin.from("tickets").select("id").eq("id", t.duplicate.ticket_id).maybeSingle();
    if (data) dup = { id: data.id, score: t.duplicate.similarity, reason: t.duplicate.reason };
  }

  const aiMeta = t.ai
    ? {
        model: t.ai.model,
        extracted_issue: t.ai.extracted_issue,
        is_safety_hazard: t.is_safety_hazard,
        category: { confidence: t.ai.confidence.category ?? 0, reason: t.ai.reasons.category ?? "" },
        department: { confidence: t.ai.confidence.department ?? 0, reason: t.ai.reasons.department ?? "" },
        priority: { confidence: t.ai.confidence.priority ?? 0, reason: t.ai.reasons.priority ?? "" },
        missing_fields: t.ai.missing_fields,
        follow_up: t.ai.follow_up,
        ...(t.ai.ai_category !== t.category
          ? { student_override: { field: "category", from: t.ai.ai_category, to: t.category } }
          : {}),
      }
    : { model: "manual", is_safety_hazard: t.is_safety_hazard, manual_entry: true };
  Object.assign(aiMeta, { moderation: t.ai ? t.moderation : "unchecked" });
  if (isSecurity) Object.assign(aiMeta, { is_emergency: t.is_emergency });
  if (isSecurity && photoUrl && t.photo_has_people) Object.assign(aiMeta, { photo_has_people: true });
  if (t.duplicate_check) {
    Object.assign(aiMeta, {
      duplicate_check: { ...t.duplicate_check, matched: dup ? t.duplicate?.ticket_id : null },
    });
  }

  // Confidential Security Office reports are only visible to the ASSIGNED security
  // officer (RLS), so give them to one straight away.
  let autoAssignee: { id: string; full_name: string } | null = null;
  if (isConfidential && department === "Security Office") {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("role", "security_officer")
      .eq("department", department)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    autoAssignee = data;
  }

  const { data: ticket, error } = await admin
    .from("tickets")
    .insert({
      module: t.module,
      reporter_id: profile.id,
      original_text: t.original_text,
      language: t.language || "en",
      english_text: t.english_text,
      title: t.title,
      summary: t.summary,
      category: t.category,
      department,
      priority,
      ai_meta: aiMeta,
      photo_url: photoUrl,
      photo_analysis: t.photo_analysis,
      building: t.location.building,
      floor: t.location.floor,
      room_no: roomNo,
      scope: roomNo || t.scope ? (t.scope ?? "room") : null,
      spot: t.location.spot,
      machine_id: t.location.machine_id,
      status: autoAssignee ? "Assigned" : "Submitted",
      assigned_to: autoAssignee?.id ?? null,
      is_confidential: isConfidential,
      hide_identity: hideIdentity,
      details_incomplete: t.details_incomplete,
      duplicate_of: dup?.id ?? null,
      duplicate_score: dup?.score ?? null,
      duplicate_reason: dup?.reason ?? null,
      duplicate_status: dup ? "flagged" : "none",
      sla_due_at: computeSlaDueAt(t.module, t.category, priority).toISOString(),
    })
    .select("id, ticket_no")
    .single();
  if (error || !ticket) {
    console.error("[createTicket]", error?.message);
    return { ok: false, error: "Could not save your ticket. Please try again." };
  }

  const events: Record<string, unknown>[] = [
    {
      ticket_id: ticket.id,
      ...actor(profile, hideIdentity),
      type: "created",
      to_status: "Submitted",
      note:
        `Reported via ${MODULE_LABELS[t.module]}${faculty ? " by faculty" : ""}` +
        (isConfidential ? " (confidential)" : "") +
        (t.details_incomplete ? " — some details were missing, staff may contact you." : "."),
    },
  ];
  if (autoAssignee) {
    const system = { actor_id: null, actor_name: "CampusConnect", actor_role: null };
    events.push(
      { ticket_id: ticket.id, ...system, type: "assigned", note: `Assigned to ${autoAssignee.full_name} (confidential report).` },
      { ticket_id: ticket.id, ...system, type: "status_change", from_status: "Submitted", to_status: "Assigned" },
    );
  }
  if (dup) {
    events.push({
      ticket_id: ticket.id,
      ...AI_ACTOR,
      type: "duplicate_flagged",
      note: `Possible duplicate (${Math.round(dup.score * 100)}% similar). ${dup.reason}`,
    });
  }
  const { error: evError } = await admin.from("ticket_events").insert(events);
  if (evError) console.error("[createTicket] events", evError.message);

  if (isSecurity && rule.escalateToDean) await createSafetyEscalation({ id: ticket.id, category: t.category, title: t.title });
  await checkEscalations({ ticketId: ticket.id });
  notifyTicketCreated(ticket.id);
  revalidatePath(myTicketsPath(profile));
  return { ok: true, id: ticket.id, ticket_no: ticket.ticket_no };
}

// ---------------------------------------------------------------------------
// "Me too"
// ---------------------------------------------------------------------------
export async function followTicket(
  ticketId: string,
  myDescription?: string,
): Promise<ActionResult<{ ticket_no: string }>> {
  const profile = await requireReporter();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(ticketId).success) return { ok: false, error: "Unknown ticket." };

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, ticket_no, reporter_id, module")
    .eq("id", ticketId)
    .maybeSingle();
  // Safety reports can't be joined (and must not reveal that they exist).
  if (!ticket || ticket.module === "security") return { ok: false, error: "That ticket no longer exists." };
  if (isFaculty(profile.role) && ticket.module !== "academic") return { ok: false, error: "That ticket no longer exists." };
  if (ticket.reporter_id === profile.id) return { ok: true, ticket_no: ticket.ticket_no };

  const { data: existing } = await admin
    .from("ticket_followers")
    .select("ticket_id")
    .eq("ticket_id", ticketId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (existing) return { ok: true, ticket_no: ticket.ticket_no };

  const { error } = await admin.from("ticket_followers").insert({ ticket_id: ticketId, user_id: profile.id });
  if (error) return { ok: false, error: "Could not follow this ticket. Please try again." };

  const extra = myDescription?.trim() ? ` They wrote: "${myDescription.trim().slice(0, 300)}"` : "";
  await admin.from("ticket_events").insert({
    ticket_id: ticketId,
    ...actor(profile),
    type: "me_too",
    note: `${profile.full_name} has the same problem (Me too).${extra}`,
  });

  await checkEscalations({ ticketId });
  revalidatePath(myTicketsPath(profile));
  return { ok: true, ticket_no: ticket.ticket_no };
}

// ---------------------------------------------------------------------------
// After "Resolved": student confirms the fix or reopens
// ---------------------------------------------------------------------------
async function loadOwnResolvedTicket(ticketId: string) {
  const profile = await requireReporter();
  if (!profile) return { error: "Please log in again." } as const;
  if (!z.uuid().safeParse(ticketId).success) return { error: "Unknown ticket." } as const;

  const admin = createAdminClient();
  const { data } = await admin.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket) return { error: "Unknown ticket." } as const;
  if (ticket.reporter_id !== profile.id) {
    return { error: "Only the person who reported this can confirm or reopen it." } as const;
  }
  if (ticket.status !== "Resolved") return { error: "This ticket is not waiting for confirmation." } as const;
  return { profile, ticket, admin } as const;
}

const ConfirmSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().trim().max(500).optional(),
});

export async function confirmFixed(
  ticketId: string,
  input: { rating: number; feedback?: string },
): Promise<ActionResult> {
  const parsed = ConfirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please choose a rating from 1 to 5 stars." };
  const loaded = await loadOwnResolvedTicket(ticketId);
  if ("error" in loaded) return { ok: false, error: loaded.error! };
  const { profile, ticket, admin } = loaded;
  const { rating, feedback } = parsed.data;

  const { error } = await admin
    .from("tickets")
    .update({ status: "Closed", rating, feedback: feedback || null })
    .eq("id", ticket.id)
    .eq("status", "Resolved");
  if (error) return { ok: false, error: "Could not close the ticket. Please try again." };

  await admin.from("ticket_events").insert([
    { ticket_id: ticket.id, ...actor(profile, ticket.hide_identity), type: "status_change", from_status: "Resolved", to_status: "Closed", note: `${isFaculty(profile.role) ? "Reporter" : "Student"} confirmed the fix.` },
    { ticket_id: ticket.id, ...actor(profile, ticket.hide_identity), type: "rating", note: `Rated ${rating}/5${feedback ? ` — "${feedback}"` : ""}` },
  ]);

  await checkEscalations({ ticketId: ticket.id });
  revalidatePath(`${myTicketsPath(profile)}/${ticket.ticket_no}`);
  revalidatePath(myTicketsPath(profile));
  return { ok: true };
}

export async function reopenTicket(ticketId: string, reason: string): Promise<ActionResult> {
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "Tell us briefly what is still wrong." };
  const loaded = await loadOwnResolvedTicket(ticketId);
  if ("error" in loaded) return { ok: false, error: loaded.error! };
  const { profile, ticket, admin } = loaded;

  const { error } = await admin
    .from("tickets")
    .update({
      status: "Reopened",
      reopen_count: ticket.reopen_count + 1,
      resolved_at: null,
      sla_due_at: computeSlaDueAt(ticket.module, ticket.category, ticket.priority).toISOString(),
    })
    .eq("id", ticket.id)
    .eq("status", "Resolved");
  if (error) return { ok: false, error: "Could not reopen the ticket. Please try again." };

  await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    ...actor(profile, ticket.hide_identity),
    type: "reopened",
    from_status: "Resolved",
    to_status: "Reopened",
    note: why.slice(0, 500),
  });

  await checkEscalations({ ticketId: ticket.id });
  revalidatePath(`${myTicketsPath(profile)}/${ticket.ticket_no}`);
  revalidatePath(myTicketsPath(profile));
  return { ok: true };
}
