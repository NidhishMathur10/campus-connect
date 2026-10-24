import "server-only";
import {
  AUTO_ASSIGN_ROLES,
  SETTING_AUTO_ASSIGN_DISABLED,
  SETTING_REASSIGN_MANUAL,
} from "@/config/assignment";
import { TRIAGE_DEPARTMENT, SECURITY_DEPARTMENTS, type Department } from "@/config/routing";
import { OPEN_STATUSES } from "@/config/statuses";
import { notifyStaffAlert, notifyStaffAssigned, notifyTicketStatus } from "@/lib/email/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Ticket } from "@/lib/types";

/**
 * Auto-assignment (picks WHO gets a ticket). The SLA watcher (sla-watcher.ts) reuses
 * `pickAssignee` for re-assignments.
 *
 * Candidates = staff of the ticket's department who are not on leave →
 * preferred building first → fewest open jobs → least recently assigned.
 */

type Admin = ReturnType<typeof createAdminClient>;

export const SYSTEM_ACTOR = { actor_id: null, actor_name: "CampusConnect", actor_role: null };

/** Statuses that count as "a job in hand" for the workload balance. */
const WORKLOAD_STATUSES = ["Assigned", "In Progress", "Reopened"];

// ---------------------------------------------------------------------------
// Settings (warden): per-department switch + "auto re-assign manual assignments"
// ---------------------------------------------------------------------------
export interface AssignmentSettings {
  disabledDepartments: string[];
  reassignManual: boolean;
}

export async function getAssignmentSettings(admin: Admin = createAdminClient()): Promise<AssignmentSettings> {
  const { data } = await admin
    .from("app_settings")
    .select("key, value")
    .in("key", [SETTING_AUTO_ASSIGN_DISABLED, SETTING_REASSIGN_MANUAL]);
  const byKey = new Map((data ?? []).map((r) => [r.key as string, r.value]));
  const disabled = byKey.get(SETTING_AUTO_ASSIGN_DISABLED);
  return {
    disabledDepartments: Array.isArray(disabled) ? (disabled as string[]) : [],
    reassignManual: byKey.get(SETTING_REASSIGN_MANUAL) === true,
  };
}

export async function saveSetting(admin: Admin, key: string, value: unknown): Promise<boolean> {
  const { error } = await admin.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) console.error("[assignment] saveSetting", error.message);
  return !error;
}

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------
export interface PickedAssignee {
  id: string;
  name: string;
  /** Why this person, for the ticket history ("fewest open jobs (1)"). */
  reason: string;
}

interface Candidate {
  id: string;
  full_name: string;
  preferred_buildings: string[] | null;
  last_assigned_at: string | null;
  openJobs: number;
  preferred: boolean;
}

export async function pickAssignee(
  admin: Admin,
  ticket: Pick<Ticket, "department" | "building">,
  excludeIds: string[] = [],
): Promise<PickedAssignee | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, preferred_buildings, last_assigned_at")
    .in("role", [...AUTO_ASSIGN_ROLES])
    .eq("department", ticket.department)
    .eq("on_leave", false);
  const people = (data ?? []).filter((p) => !excludeIds.includes(p.id));
  if (people.length === 0) return null;

  const { data: jobs } = await admin
    .from("tickets")
    .select("assigned_to")
    .in("assigned_to", people.map((p) => p.id))
    .in("status", WORKLOAD_STATUSES);
  const open = new Map<string, number>();
  for (const j of jobs ?? []) open.set(j.assigned_to, (open.get(j.assigned_to) ?? 0) + 1);

  const candidates: Candidate[] = people.map((p) => ({
    ...p,
    openJobs: open.get(p.id) ?? 0,
    preferred: !!ticket.building && (p.preferred_buildings ?? []).includes(ticket.building),
  }));
  // Oldest assignment first; never-assigned (null) comes before everyone.
  const lastAssigned = (c: Candidate) => (c.last_assigned_at ? new Date(c.last_assigned_at).getTime() : 0);
  candidates.sort(
    (a, b) =>
      Number(b.preferred) - Number(a.preferred) ||
      a.openJobs - b.openJobs ||
      lastAssigned(a) - lastAssigned(b) ||
      a.full_name.localeCompare(b.full_name),
  );

  const top = candidates[0];
  const tier = candidates.filter((c) => c.preferred === top.preferred);
  const parts: string[] = [];
  if (top.preferred && candidates.some((c) => !c.preferred)) parts.push(`covers ${ticket.building}`);
  if (tier.length > 1) {
    parts.push(tier.some((c) => c.openJobs > top.openJobs) ? `fewest open jobs (${top.openJobs})` : "least recently assigned");
  }
  if (parts.length === 0) parts.push(candidates.length === 1 ? "only available staff member" : "available");
  return { id: top.id, name: top.full_name, reason: parts.join(", ") };
}

/** Who hears about SLA problems and missing staff: the warden (hostel) or the HOD (academic). Safety: nobody. */
export async function adminRecipientIds(admin: Admin, module: Ticket["module"]): Promise<string[]> {
  const role = module === "hostel" ? "warden" : module === "academic" ? "hod" : null;
  if (!role) return [];
  const { data } = await admin.from("profiles").select("id").eq("role", role);
  return (data ?? []).map((p) => p.id as string);
}

// ---------------------------------------------------------------------------
// Auto-assign on create / reopen / re-route
// ---------------------------------------------------------------------------
export type AutoAssignTrigger = "created" | "reopened" | "rerouted";

export type AutoAssignResult =
  | { ok: true; assignee: { id: string; name: string }; reason: string }
  | { ok: false; why: "skipped" | "none" | "error" };

/** Can this ticket ever be auto-assigned? ("Other" → warden triage, safety reports → their own flow.) */
export function isAutoAssignable(t: Pick<Ticket, "module" | "is_confidential" | "department">): boolean {
  return (
    t.module !== "security" &&
    !t.is_confidential &&
    t.department !== TRIAGE_DEPARTMENT &&
    !SECURITY_DEPARTMENTS.includes(t.department as Department)
  );
}

/**
 * Picks staff for a ticket and assigns them (status → Assigned, history event, emails + bell for
 * the staff member and the student). Never throws. If nobody is available the ticket stays
 * unassigned and the warden is told.
 */
export async function autoAssignTicket(ticketId: string, trigger: AutoAssignTrigger): Promise<AutoAssignResult> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("tickets").select("*").eq("id", ticketId).maybeSingle();
    const ticket = data as Ticket | null;
    if (!ticket || !OPEN_STATUSES.includes(ticket.status) || !isAutoAssignable(ticket)) return { ok: false, why: "skipped" };
    // Reopened tickets are handed out again; everything else only when nobody has them.
    if (ticket.assigned_to && trigger !== "reopened") return { ok: false, why: "skipped" };

    const settings = await getAssignmentSettings(admin);
    if (settings.disabledDepartments.includes(ticket.department)) {
      // Auto-assign is off: a reopened job still goes back to the person who had it, as a phone alert.
      if (trigger === "reopened" && ticket.assigned_to) {
        notifyStaffAlert({
          ticketId: ticket.id,
          recipientIds: [ticket.assigned_to],
          template: "ticket_reopened",
          title: `${ticket.ticket_no} was reopened`,
          message: `${ticket.ticket_no} (${ticket.title}) was reopened by the student.`,
          push: "job",
          pushOnly: true,
        });
      }
      return { ok: false, why: "skipped" };
    }

    const pick = await pickAssignee(admin, ticket);
    if (!pick) {
      await admin.from("ticket_events").insert({
        ticket_id: ticket.id,
        ...SYSTEM_ACTOR,
        type: "note",
        is_internal: true,
        note: `Auto-assign: no ${ticket.department} staff are available right now (on leave or none set up) — left unassigned.`,
      });
      notifyStaffAlert({
        ticketId: ticket.id,
        recipientIds: await adminRecipientIds(admin, ticket.module),
        template: "no_staff_available",
        title: `No staff available for ${ticket.ticket_no}`,
        message: `nobody in ${ticket.department} can take ${ticket.ticket_no} (${ticket.title}) right now, so it is unassigned. Please assign it manually.`,
      });
      return { ok: false, why: "none" };
    }

    const moveToAssigned = ticket.status !== "Assigned";
    const { data: updated, error } = await admin
      .from("tickets")
      .update({ assigned_to: pick.id, assigned_auto: true, ...(moveToAssigned ? { status: "Assigned" } : {}) })
      .eq("id", ticket.id)
      .eq("status", ticket.status)
      .select("id");
    if (error || !updated?.length) {
      if (error) console.error("[autoAssign]", error.message);
      return { ok: false, why: "error" };
    }

    await admin.from("profiles").update({ last_assigned_at: new Date().toISOString() }).eq("id", pick.id);
    const events: Record<string, unknown>[] = [
      { ticket_id: ticket.id, ...SYSTEM_ACTOR, type: "assigned", note: `Auto-assigned to ${pick.name} — ${pick.reason}` },
    ];
    if (moveToAssigned) {
      events.push({ ticket_id: ticket.id, ...SYSTEM_ACTOR, type: "status_change", from_status: ticket.status, to_status: "Assigned" });
    }
    const { error: evError } = await admin.from("ticket_events").insert(events);
    if (evError) console.error("[autoAssign] events", evError.message);

    notifyStaffAssigned(ticket.id, pick.id, { reopened: trigger === "reopened" });
    if (moveToAssigned) notifyTicketStatus(ticket.id, "Assigned");
    return { ok: true, assignee: { id: pick.id, name: pick.name }, reason: pick.reason };
  } catch (err) {
    console.error("[autoAssign]", err instanceof Error ? err.message : err);
    return { ok: false, why: "error" };
  }
}

/** A new SLA window starting now (reopen): clears the reminder and any "waiting for parts" pause. */
export function freshSlaWindow() {
  return { sla_started_at: new Date().toISOString(), sla_reminded_at: null, sla_paused_at: null, waiting_reason: null };
}

/**
 * Fields that restart the SLA timer after a pause: the deadline moves out by the time spent waiting.
 * Spread into a tickets update.
 */
export function resumeSlaFields(t: Pick<Ticket, "sla_paused_at" | "sla_due_at" | "sla_paused_seconds">, now = new Date()) {
  if (!t.sla_paused_at) return {};
  const pausedMs = Math.max(0, now.getTime() - new Date(t.sla_paused_at).getTime());
  return {
    sla_paused_at: null,
    waiting_reason: null,
    sla_paused_seconds: t.sla_paused_seconds + Math.round(pausedMs / 1000),
    ...(t.sla_due_at ? { sla_due_at: new Date(new Date(t.sla_due_at).getTime() + pausedMs).toISOString() } : {}),
  };
}
