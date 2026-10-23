"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  categoriesFor,
  computeSlaDueAt,
  DEPARTMENTS,
  PRIORITIES,
  SECURITY_DEPARTMENTS,
  type Department,
  type Priority,
} from "@/config/routing";
import { canTransition, NOTE_REQUIRED_STATUSES, TICKET_STATUSES, type TicketStatus } from "@/config/statuses";
import { autoAssignTicket, freshSlaWindow, resumeSlaFields } from "@/lib/assignment";
import { getCurrentProfile } from "@/lib/auth";
import { notifyStaffAssigned, notifyTicketMerged, notifyTicketStatus } from "@/lib/email/notify";
import { checkEscalations, createManualEscalation } from "@/lib/escalations";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Ticket } from "@/lib/types";
import { ASSIGNABLE_ROLES, canEscalateManually, canManageTicket } from "./access";
import type { ActionResult } from "./actions";

type Admin = ReturnType<typeof createAdminClient>;

function actor(p: Profile) {
  return { actor_id: p.id, actor_name: p.full_name, actor_role: p.role };
}

/**
 * Loads the ticket with the service-role client, but only after checking the
 * caller may manage it (same rules as RLS can_manage_ticket()).
 */
async function loadManaged(
  ticketId: string,
): Promise<{ ok: true; profile: Profile; ticket: Ticket; admin: Admin } | { ok: false; error: string }> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(ticketId).success) return { ok: false, error: "Unknown ticket." };

  const admin = createAdminClient();
  const { data } = await admin.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket) return { ok: false, error: "That ticket no longer exists." };
  if (!canManageTicket(profile, ticket)) {
    return { ok: false, error: "You can view this ticket but not change it." };
  }
  return { ok: true, profile, ticket, admin };
}

async function addEvents(admin: Admin, rows: Record<string, unknown>[]) {
  const { error } = await admin.from("ticket_events").insert(rows);
  if (error) console.error("[staff-actions] events", error.message);
}

async function done(ticketId: string, ticketNo: string): Promise<ActionResult> {
  await checkEscalations({ ticketId });
  revalidatePath("/staff");
  revalidatePath(`/tickets/${ticketNo}`);
  revalidatePath("/tickets");
  return { ok: true };
}

const noteSchema = z.string().trim().max(1000);

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------
export async function assignTicket(ticketId: string, assigneeId: string | null): Promise<ActionResult> {
  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;
  if (["Closed", "Merged"].includes(ticket.status)) return { ok: false, error: "This ticket is already closed." };

  let assignee: { id: string; full_name: string; department: string | null } | null = null;
  if (assigneeId) {
    if (!z.uuid().safeParse(assigneeId).success) return { ok: false, error: "Unknown staff member." };
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, department, role")
      .eq("id", assigneeId)
      .maybeSingle();
    if (!data || !ASSIGNABLE_ROLES.includes(data.role)) return { ok: false, error: "Pick a staff member." };
    // Department staff assign within the ticket's department; the warden can pick anyone.
    if (profile.role !== "warden" && data.department !== ticket.department) {
      return { ok: false, error: `Only ${ticket.department} staff can be assigned this ticket.` };
    }
    assignee = data;
  }
  if ((assignee?.id ?? null) === ticket.assigned_to) return { ok: true };

  const moveToAssigned = !!assignee && (ticket.status === "Submitted" || ticket.status === "Reopened");
  const { error } = await admin
    .from("tickets")
    .update({ assigned_to: assignee?.id ?? null, assigned_auto: false, ...(moveToAssigned ? { status: "Assigned" } : {}) })
    .eq("id", ticket.id);
  if (error) return { ok: false, error: "Could not assign the ticket. Please try again." };

  const events: Record<string, unknown>[] = [
    {
      ticket_id: ticket.id,
      ...actor(profile),
      type: "assigned",
      note: assignee ? `Assigned to ${assignee.full_name}` : "Unassigned",
    },
  ];
  if (moveToAssigned) {
    events.push({ ticket_id: ticket.id, ...actor(profile), type: "status_change", from_status: ticket.status, to_status: "Assigned" });
  }
  await addEvents(admin, events);
  if (assignee) await admin.from("profiles").update({ last_assigned_at: new Date().toISOString() }).eq("id", assignee.id);
  if (assignee) notifyStaffAssigned(ticket.id, assignee.id);
  if (moveToAssigned) notifyTicketStatus(ticket.id, "Assigned");
  return done(ticket.id, ticket.ticket_no);
}

// ---------------------------------------------------------------------------
// Status change
// ---------------------------------------------------------------------------
export async function changeTicketStatus(
  ticketId: string,
  input: { to: TicketStatus; note?: string; assigneeId?: string | null },
): Promise<ActionResult> {
  const to = z.enum(TICKET_STATUSES).safeParse(input.to);
  const noteParsed = noteSchema.safeParse(input.note ?? "");
  if (!to.success || !noteParsed.success) return { ok: false, error: "Invalid status change." };
  const note = noteParsed.data;

  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;

  if (!canTransition(ticket.status, to.data)) {
    return { ok: false, error: `Can't move a ${ticket.status} ticket to ${to.data}.` };
  }
  if (NOTE_REQUIRED_STATUSES.includes(to.data) && note.length < 3) {
    return { ok: false, error: `Please add a short note for the student when moving to ${to.data}.` };
  }

  // Moving to Assigned needs someone to assign: the chosen person, or yourself.
  if (to.data === "Assigned") {
    const assigneeId = input.assigneeId ?? ticket.assigned_to ?? (profile.role !== "warden" ? profile.id : null);
    if (!assigneeId) return { ok: false, error: "Pick who should work on this ticket." };
    if (assigneeId !== ticket.assigned_to) {
      const res = await assignTicket(ticket.id, assigneeId);
      if (!res.ok) return res;
      // assignTicket already moved Submitted/Reopened → Assigned.
      if (ticket.status === "Submitted" || ticket.status === "Reopened") {
        if (note) await addEvents(admin, [{ ticket_id: ticket.id, ...actor(profile), type: "note", note }]);
        return done(ticket.id, ticket.ticket_no);
      }
    }
  }

  const resolving = to.data === "Resolved";
  const update: Record<string, unknown> = {
    status: to.data,
    resolved_at: resolving ? new Date().toISOString() : null,
  };
  // Starting work yourself on an unassigned ticket assigns it to you.
  if (to.data === "In Progress" && !ticket.assigned_to && profile.role !== "warden") {
    update.assigned_to = profile.id;
    update.assigned_auto = false;
  }
  // Any move ends a "waiting for parts" pause: the deadline moves out by the time spent waiting.
  Object.assign(update, resumeSlaFields(ticket));

  const { error } = await admin.from("tickets").update(update).eq("id", ticket.id).eq("status", ticket.status);
  if (error) return { ok: false, error: "Could not update the status. Please try again." };

  const events: Record<string, unknown>[] = [];
  if (update.assigned_to) {
    events.push({ ticket_id: ticket.id, ...actor(profile), type: "assigned", note: `Assigned to ${profile.full_name}` });
  }
  events.push({
    ticket_id: ticket.id,
    ...actor(profile),
    type: "status_change",
    from_status: ticket.status,
    to_status: to.data,
    note: note || (resolving ? "Marked resolved." : null),
  });
  await addEvents(admin, events);
  notifyTicketStatus(ticket.id, to.data, note);
  return done(ticket.id, ticket.ticket_no);
}

// ---------------------------------------------------------------------------
// Overrides (category / department / priority) — department change reroutes
// ---------------------------------------------------------------------------
const OverrideSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("category"), value: z.string() }),
  z.object({ field: z.literal("department"), value: z.enum(DEPARTMENTS) }),
  z.object({ field: z.literal("priority"), value: z.enum(PRIORITIES) }),
]);

export async function overrideTicketField(
  ticketId: string,
  input: { field: "category" | "department" | "priority"; value: string; reason: string },
): Promise<ActionResult> {
  const parsed = OverrideSchema.safeParse(input);
  const reason = input.reason?.trim() ?? "";
  if (!parsed.success) return { ok: false, error: "Pick a valid value." };
  if (reason.length < 3) return { ok: false, error: "Please give a short reason for the change." };

  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;
  const { field, value } = parsed.data;
  if (ticket[field] === value) return { ok: true };

  const update: Record<string, unknown> = { [field]: value };
  const publicNotes: string[] = [];

  if (field === "category") {
    if (!(categoriesFor(ticket.module) as readonly string[]).includes(value)) {
      return { ok: false, error: "That category isn't used in this module." };
    }
    update.sla_due_at = computeSlaDueAt(ticket.module, value, ticket.priority, new Date(ticket.created_at)).toISOString();
  }
  if (field === "priority") {
    update.sla_due_at = computeSlaDueAt(ticket.module, ticket.category, value as Priority, new Date(ticket.created_at)).toISOString();
  }
  if (field === "department") {
    // Confidential safety work must stay inside the security departments (and vice versa).
    const isSecurityDept = SECURITY_DEPARTMENTS.includes(value as Department);
    if (isSecurityDept !== (ticket.module === "security")) {
      return {
        ok: false,
        error:
          ticket.module === "security"
            ? "Safety reports can only go to the Anti-Ragging Committee or the Security Office."
            : "Only Safety & Security reports can go to that department.",
      };
    }
    // Reroute: the old assignee belongs to the old department, so release the ticket.
    if (ticket.assigned_to) {
      const { data: assignee } = await admin.from("profiles").select("department").eq("id", ticket.assigned_to).maybeSingle();
      if (assignee?.department !== value) {
        update.assigned_to = null;
        if (ticket.status === "Assigned") update.status = "Submitted";
      }
    }
    publicNotes.push(`Sent to ${value}.`);
  }

  const { error } = await admin.from("tickets").update(update).eq("id", ticket.id);
  if (error) return { ok: false, error: "Could not save the change. Please try again." };

  const label = field[0].toUpperCase() + field.slice(1);
  const events: Record<string, unknown>[] = [
    { ticket_id: ticket.id, ...actor(profile), type: "override", note: `${label}: ${ticket[field]} → ${value}. Reason: ${reason}` },
  ];
  if (update.status) {
    events.push({ ticket_id: ticket.id, ...actor(profile), type: "status_change", from_status: ticket.status, to_status: update.status });
  }
  // Students can't see overrides, so tell them where their ticket went.
  if (publicNotes.length) events.push({ ticket_id: ticket.id, ...actor(profile), type: "note", note: publicNotes.join(" ") });
  await addEvents(admin, events);
  // Rerouted to another team and released by the old assignee: pick someone there.
  if (field === "department" && update.assigned_to === null) await autoAssignTicket(ticket.id, "rerouted");
  return done(ticket.id, ticket.ticket_no);
}

// ---------------------------------------------------------------------------
// "Waiting for parts / external dependency": pauses the SLA timer on an In Progress ticket
// ---------------------------------------------------------------------------
export async function pauseTicketSla(ticketId: string, note: string): Promise<ActionResult> {
  const why = noteSchema.safeParse(note);
  if (!why.success || why.data.length < 3) return { ok: false, error: "Say what you are waiting for (e.g. \"New tap washer ordered\")." };
  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;
  if (ticket.status !== "In Progress") return { ok: false, error: "Only tickets that are In Progress can be put on hold." };
  if (ticket.sla_paused_at) return { ok: false, error: "This ticket is already waiting." };

  const { data, error } = await admin
    .from("tickets")
    .update({ sla_paused_at: new Date().toISOString(), waiting_reason: why.data })
    .eq("id", ticket.id)
    .eq("status", "In Progress")
    .is("sla_paused_at", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Could not put the ticket on hold. Please try again." };
  await addEvents(admin, [
    {
      ticket_id: ticket.id,
      ...actor(profile),
      type: "note",
      note: `Waiting for parts / external dependency: ${why.data} — the deadline timer is paused until work resumes.`,
    },
  ]);
  return done(ticket.id, ticket.ticket_no);
}

export async function resumeTicketSla(ticketId: string): Promise<ActionResult> {
  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;
  if (!ticket.sla_paused_at) return { ok: false, error: "This ticket isn't waiting." };

  const fields = resumeSlaFields(ticket);
  const { data, error } = await admin
    .from("tickets")
    .update(fields)
    .eq("id", ticket.id)
    .eq("sla_paused_at", ticket.sla_paused_at)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Could not resume the ticket. Please try again." };
  await addEvents(admin, [
    { ticket_id: ticket.id, ...actor(profile), type: "note", note: "Work resumed — the deadline timer is running again (the waiting time was added back)." },
  ]);
  return done(ticket.id, ticket.ticket_no);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
export async function addTicketNote(
  ticketId: string,
  input: { note: string; internal: boolean },
): Promise<ActionResult> {
  const note = noteSchema.safeParse(input.note);
  if (!note.success || note.data.length < 2) return { ok: false, error: "Write a note first." };
  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;

  await addEvents(admin, [
    { ticket_id: ticket.id, ...actor(profile), type: "note", note: note.data, is_internal: !!input.internal },
  ]);
  return done(ticket.id, ticket.ticket_no);
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------
export async function mergeDuplicate(ticketId: string): Promise<ActionResult> {
  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;
  if (ticket.duplicate_status !== "flagged" || !ticket.duplicate_of) {
    return { ok: false, error: "This ticket isn't flagged as a duplicate." };
  }

  const { data: origData } = await admin.from("tickets").select("*").eq("id", ticket.duplicate_of).maybeSingle();
  const original = origData as Ticket | null;
  if (!original || original.status === "Merged") {
    return { ok: false, error: "The original ticket is gone or was itself merged. Use “Not a duplicate” instead." };
  }

  const { error } = await admin
    .from("tickets")
    .update({ status: "Merged", duplicate_status: "merged" })
    .eq("id", ticket.id)
    .eq("duplicate_status", "flagged");
  if (error) return { ok: false, error: "Could not merge. Please try again." };

  // Reporter + followers of the duplicate now follow the original.
  const { data: followers } = await admin.from("ticket_followers").select("user_id").eq("ticket_id", ticket.id);
  const userIds = [...new Set([ticket.reporter_id, ...(followers ?? []).map((f) => f.user_id as string)])].filter(
    (id) => id !== original.reporter_id,
  );
  if (userIds.length) {
    const { error: fErr } = await admin
      .from("ticket_followers")
      .upsert(userIds.map((user_id) => ({ ticket_id: original.id, user_id })), {
        onConflict: "ticket_id,user_id",
        ignoreDuplicates: true,
      });
    if (fErr) console.error("[mergeDuplicate] followers", fErr.message);
  }

  await addEvents(admin, [
    {
      ticket_id: ticket.id,
      ...actor(profile),
      type: "merged",
      from_status: ticket.status,
      to_status: "Merged",
      note: `Merged into ${original.ticket_no} — the same problem was already reported. You'll get updates there.`,
    },
    {
      ticket_id: original.id,
      ...actor(profile),
      type: "merged",
      note: `${ticket.ticket_no} was merged into this ticket — ${userIds.length} more student${userIds.length === 1 ? "" : "s"} affected.`,
    },
  ]);
  await checkEscalations({ ticketId: original.id });
  notifyTicketMerged(ticket.id, original.ticket_no);
  revalidatePath(`/tickets/${original.ticket_no}`);
  return done(ticket.id, ticket.ticket_no);
}

export async function dismissDuplicate(ticketId: string): Promise<ActionResult> {
  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;
  if (ticket.duplicate_status !== "flagged") return { ok: false, error: "This ticket isn't flagged as a duplicate." };

  const { error } = await admin.from("tickets").update({ duplicate_status: "dismissed" }).eq("id", ticket.id);
  if (error) return { ok: false, error: "Could not update. Please try again." };
  await addEvents(admin, [
    { ticket_id: ticket.id, ...actor(profile), type: "duplicate_dismissed", note: "Reviewed by staff — not a duplicate." },
  ]);
  return done(ticket.id, ticket.ticket_no);
}

// ---------------------------------------------------------------------------
// Manual escalation: warden → Dean (hostel); Academic Office / HOD → HOD inbox (academic)
// ---------------------------------------------------------------------------
export async function escalateTicket(ticketId: string, reason: string): Promise<ActionResult> {
  const why = reason.trim();
  if (why.length < 5) return { ok: false, error: "Say briefly why this needs senior attention." };
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(ticketId).success) return { ok: false, error: "Unknown ticket." };

  const admin = createAdminClient();
  const { data } = await admin.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket) return { ok: false, error: "That ticket no longer exists." };
  if (!canEscalateManually(profile, ticket)) {
    return { ok: false, error: "Only the warden (hostel), the Academic Office or the HOD (academic) can escalate this ticket." };
  }

  const res = await createManualEscalation({
    ticket,
    reason: why,
    actor: { id: profile.id, name: profile.full_name, role: profile.role },
  });
  if (!res.ok) return res;
  revalidatePath("/escalations");
  return done(ticket.id, ticket.ticket_no);
}

// ---------------------------------------------------------------------------
// Warden: reopen a closed / resolved hostel ticket
// ---------------------------------------------------------------------------
export async function wardenReopenTicket(ticketId: string, reason: string): Promise<ActionResult> {
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "Say briefly why it is being reopened." };
  const loaded = await loadManaged(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket, admin } = loaded;
  if (profile.role !== "warden") return { ok: false, error: "Only the warden can reopen closed tickets." };
  if (ticket.status !== "Closed" && ticket.status !== "Resolved") {
    return { ok: false, error: "Only resolved or closed tickets can be reopened." };
  }

  const { error } = await admin
    .from("tickets")
    .update({
      status: "Reopened",
      reopen_count: ticket.reopen_count + 1,
      resolved_at: null,
      sla_due_at: computeSlaDueAt(ticket.module, ticket.category, ticket.priority).toISOString(),
      ...freshSlaWindow(),
    })
    .eq("id", ticket.id)
    .eq("status", ticket.status);
  if (error) return { ok: false, error: "Could not reopen the ticket. Please try again." };

  await addEvents(admin, [
    { ticket_id: ticket.id, ...actor(profile), type: "reopened", from_status: ticket.status, to_status: "Reopened", note: why.slice(0, 500) },
  ]);
  await autoAssignTicket(ticket.id, "reopened");
  return done(ticket.id, ticket.ticket_no);
}
