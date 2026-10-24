import "server-only";
import { SLA_REMINDER_FRACTION, SLA_WATCHER_THROTTLE_MS } from "@/config/assignment";
import { computeSlaDueAt } from "@/config/routing";
import { OPEN_STATUSES } from "@/config/statuses";
import { escalateStaleConcerns } from "@/lib/concerns/escalate";
import {
  adminRecipientIds,
  getAssignmentSettings,
  isAutoAssignable,
  pickAssignee,
  SYSTEM_ACTOR,
  type AssignmentSettings,
} from "@/lib/assignment";
import { DOUBT_REMINDER_HOURS } from "@/config/subjects";
import { notifyDoubtReminder } from "@/lib/email/doubt-notify";
import { notifyStaffAlert, notifyTicketStatus } from "@/lib/email/notify";
import { createSlaBreachEscalation } from "@/lib/escalations";
import { runSportsWatcher } from "@/lib/sports/core";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AssignmentHistoryEntry, Ticket } from "@/lib/types";

/**
 * SLA watcher. Safe to call as often as you like: every step claims its ticket with a guarded
 * UPDATE first (the reminder via `sla_reminded_at is null`, a breach via `sla_due_at = <old value>`),
 * so two overlapping runs can't send a reminder or re-assign a ticket twice.
 *
 *  - 75% of the SLA window used → one reminder to the assignee (arc / Dean for confidential reports).
 *  - Deadline missed → the ticket moves to the next eligible staff member with a fresh SLA window
 *    (never back to anyone it was taken from); the warden and both staff members are told. Manually
 *    assigned tickets are only flagged (unless the "auto re-assign manual assignments" setting is on);
 *    confidential Safety tickets are never moved. A flagged ticket keeps its (overdue) deadline;
 *    `sla_reminded_at >= sla_due_at` marks that deadline as handled so it is only processed once.
 *  - Second missed deadline → an `sla_breach` escalation to the Dean (hostel) / HOD (academic).
 *  - "Ask my teacher" doubts still waiting for a teacher after 48 hours → one reminder to the subject
 *    teachers (re-armed by each new student message; claimed with a guarded UPDATE on `reminder_sent_at`).
 *  - Tickets paused with "Waiting for parts / external dependency" are skipped (timer stopped).
 *
 * TODO(pg_cron): the watcher currently runs when the staff board, escalations or insights pages
 * load (throttled to once a minute) and from the "Run SLA check now" button. To run it on a
 * schedule, call a protected route handler from Supabase pg_cron + pg_net every minute, e.g.
 *   select cron.schedule('sla-watcher', '* * * * *', $$ select net.http_post(
 *     url := 'https://<app>/api/cron/sla', headers := '{"Authorization":"Bearer <CRON_SECRET>"}'::jsonb) $$);
 * and have that route call runSlaWatcher({ force: true }).
 */

export interface SlaWatcherResult {
  ran: boolean;
  reminders: number;
  reassigned: number;
  flagged: number;
  escalated: number;
  /** "Ask my teacher" reminders sent. */
  doubtReminders: number;
}

const EMPTY: SlaWatcherResult = { ran: false, reminders: 0, reassigned: 0, flagged: 0, escalated: 0, doubtReminders: 0 };

type Admin = ReturnType<typeof createAdminClient>;
const g = globalThis as unknown as { __slaWatcher?: { last: number; running: Promise<SlaWatcherResult> | null } };
const state = (g.__slaWatcher ??= { last: 0, running: null });

/** Runs the watcher (throttled to once a minute unless `force`). Never throws. */
export async function runSlaWatcher(opts: { force?: boolean } = {}): Promise<SlaWatcherResult> {
  if (state.running) return state.running;
  if (!opts.force && Date.now() - state.last < SLA_WATCHER_THROTTLE_MS) return EMPTY;
  state.last = Date.now();
  state.running = scan().catch((err) => {
    console.error("[slaWatcher]", err instanceof Error ? err.message : err);
    return EMPTY;
  });
  try {
    return await state.running;
  } finally {
    state.running = null;
  }
}

async function scan(): Promise<SlaWatcherResult> {
  const admin = createAdminClient();
  const result: SlaWatcherResult = { ...EMPTY, ran: true };
  // Sports equipment: expire no-shows, due-soon reminders, overdue flags (has its own throttle + guarded updates).
  await runSportsWatcher({ force: true });
  try {
    result.doubtReminders = await remindUnansweredDoubts(admin);
  } catch (err) {
    console.error("[slaWatcher] doubts", err instanceof Error ? err.message : err);
  }
  try {
    // Teacher concerns the HOD has not acknowledged within 72h go to the Dean.
    result.escalated += await escalateStaleConcerns();
  } catch (err) {
    console.error("[slaWatcher] concerns", err instanceof Error ? err.message : err);
  }
  const { data, error } = await admin
    .from("tickets")
    .select("*")
    .in("status", OPEN_STATUSES)
    .not("sla_due_at", "is", null)
    .is("sla_paused_at", null)
    .limit(500);
  if (error) throw new Error(error.message);
  const tickets = (data ?? []) as Ticket[];
  if (tickets.length === 0) return result;

  const settings = await getAssignmentSettings(admin);
  const now = Date.now();
  for (const t of tickets) {
    try {
      const due = new Date(t.sla_due_at!).getTime();
      if (due <= now) {
        // Already handled for this deadline (flagged without a new window): sla_reminded_at is stamped at/after it.
        if (t.sla_reminded_at && t.sla_reminded_at >= t.sla_due_at!) continue;
        await handleBreach(admin, t, settings, result);
      } else if (!t.sla_reminded_at) {
        const start = new Date(t.sla_started_at ?? t.created_at).getTime();
        if (now >= start + SLA_REMINDER_FRACTION * (due - start)) await handleReminder(admin, t, result);
      }
    } catch (err) {
      console.error(`[slaWatcher] ${t.ticket_no}`, err instanceof Error ? err.message : err);
    }
  }
  return result;
}

/** One reminder per unanswered student message after DOUBT_REMINDER_HOURS. */
async function remindUnansweredDoubts(admin: Admin): Promise<number> {
  const cutoff = new Date(Date.now() - DOUBT_REMINDER_HOURS * 3_600_000).toISOString();
  const { data } = await admin
    .from("doubt_threads")
    .select("id, subject, title, last_message_at, reminder_sent_at")
    .eq("status", "open")
    .lt("last_message_at", cutoff)
    .limit(100);
  let sent = 0;
  for (const t of data ?? []) {
    if (t.reminder_sent_at && t.reminder_sent_at >= t.last_message_at) continue;
    // Claim it first so overlapping runs send one reminder.
    let claim = admin.from("doubt_threads").update({ reminder_sent_at: new Date().toISOString() }).eq("id", t.id).eq("status", "open");
    claim = t.reminder_sent_at ? claim.eq("reminder_sent_at", t.reminder_sent_at) : claim.is("reminder_sent_at", null);
    const { data: won } = await claim.select("id");
    if (!won?.length) continue;
    notifyDoubtReminder({ id: t.id as string, subject: t.subject as string, title: t.title as string });
    sent++;
  }
  return sent;
}

const nameOf = async (admin: Admin, id: string | null) => {
  if (!id) return null;
  const { data } = await admin.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return (data?.full_name as string | undefined) ?? null;
};

/** Who gets a reminder: the assignee, or arc + Dean for confidential Safety tickets. */
async function reminderRecipients(admin: Admin, t: Ticket): Promise<string[]> {
  if (!t.is_confidential) return t.assigned_to ? [t.assigned_to] : [];
  const { data } = await admin.from("profiles").select("id, role, department").in("role", ["arc", "dean"]);
  return (data ?? [])
    .filter((p) => p.role === "dean" || p.department === t.department)
    .map((p) => p.id as string);
}

// ---------------------------------------------------------------------------
// 75% reminder
// ---------------------------------------------------------------------------
async function handleReminder(admin: Admin, t: Ticket, result: SlaWatcherResult) {
  const recipients = await reminderRecipients(admin, t);
  if (recipients.length === 0) return; // nobody to remind yet; try again once someone has it
  const { data: claimed } = await admin
    .from("tickets")
    .update({ sla_reminded_at: new Date().toISOString() })
    .eq("id", t.id)
    .is("sla_reminded_at", null)
    .select("id");
  if (!claimed?.length) return;

  const who = t.is_confidential ? "the responsible team" : ((await nameOf(admin, t.assigned_to)) ?? "the assignee");
  await admin.from("ticket_events").insert({
    ticket_id: t.id,
    ...SYSTEM_ACTOR,
    type: "note",
    is_internal: true,
    note: `SLA reminder sent to ${who}: 75% of the time window is used.`,
  });
  notifyStaffAlert({
    ticketId: t.id,
    recipientIds: recipients,
    template: "sla_reminder",
    title: `Reminder: ${t.ticket_no} is almost due`,
    message: `${t.ticket_no} (${t.title}) has used 75% of its time window. Please update or resolve it before the deadline.`,
    push: "reminder",
  });
  result.reminders++;
}

// ---------------------------------------------------------------------------
// Deadline missed
// ---------------------------------------------------------------------------
async function handleBreach(admin: Admin, t: Ticket, settings: AssignmentSettings, result: SlaWatcherResult) {
  const nowIso = new Date().toISOString();
  const breachCount = t.sla_breach_count + 1;
  // Claim: stamp sla_reminded_at (= "this deadline is handled") only if nobody else has for this deadline.
  let claim = admin
    .from("tickets")
    .update({ sla_reminded_at: nowIso, sla_breach_count: breachCount })
    .eq("id", t.id)
    .eq("sla_due_at", t.sla_due_at!);
  claim = t.sla_reminded_at ? claim.eq("sla_reminded_at", t.sla_reminded_at) : claim.is("sla_reminded_at", null);
  const { data: claimed } = await claim.select("id");
  if (!claimed?.length) return;

  const event = (note: string, extra: Record<string, unknown> = {}) =>
    admin.from("ticket_events").insert({ ticket_id: t.id, ...SYSTEM_ACTOR, type: "note", is_internal: true, note, ...extra });
  const wardenIds = await adminRecipientIds(admin, t.module);
  const oldName = await nameOf(admin, t.assigned_to);

  // Confidential Safety tickets: never moved, only a (content-free) nudge to arc / Dean.
  if (t.is_confidential) {
    await event("SLA deadline passed — confidential report, not auto-reassigned. Reminder sent to the responsible team.");
    notifyStaffAlert({
      ticketId: t.id,
      recipientIds: await reminderRecipients(admin, t),
      template: "sla_breach",
      title: `Deadline passed on ${t.ticket_no}`,
      message: `${t.ticket_no} has passed its deadline.`,
    });
    result.flagged++;
    return;
  }

  const mayReassign =
    isAutoAssignable(t) &&
    !settings.disabledDepartments.includes(t.department) &&
    (!t.assigned_to || t.assigned_auto || settings.reassignManual);

  if (!mayReassign) {
    const why = !t.assigned_to
      ? "it is unassigned"
      : isAutoAssignable(t) && !settings.disabledDepartments.includes(t.department)
        ? "it was assigned manually"
        : "auto-assignment is off for this ticket";
    await event(`SLA deadline missed — not auto-reassigned: ${why}.`);
    notifyStaffAlert({
      ticketId: t.id,
      recipientIds: [...new Set([...wardenIds, ...(t.assigned_to ? [t.assigned_to] : [])])],
      template: "sla_breach",
      title: `Deadline missed: ${t.ticket_no}`,
      message: `${t.ticket_no} (${t.title}) missed its deadline${oldName ? ` while with ${oldName}` : ""}. It was not reassigned automatically because ${why}.`,
    });
    result.flagged++;
  } else {
    const history = Array.isArray(t.assignment_history) ? t.assignment_history : [];
    const exclude = [...history.map((h) => h.from_id).filter((id): id is string => !!id), ...(t.assigned_to ? [t.assigned_to] : [])];
    const pick = await pickAssignee(admin, t, exclude);
    if (!pick) {
      await event(`SLA deadline missed — no other ${t.department} staff are available to take it${oldName ? `; it stays with ${oldName}` : ""}.`);
      notifyStaffAlert({
        ticketId: t.id,
        recipientIds: [...new Set([...wardenIds, ...(t.assigned_to ? [t.assigned_to] : [])])],
        template: "sla_breach",
        title: `Deadline missed: ${t.ticket_no}`,
        message: `${t.ticket_no} (${t.title}) missed its deadline and no other ${t.department} staff are available to take it over. Please step in.`,
      });
      result.flagged++;
    } else {
      const entry: AssignmentHistoryEntry = {
        from_id: t.assigned_to,
        from_name: oldName,
        to_id: pick.id,
        to_name: pick.name,
        reason: "deadline missed",
        at: nowIso,
      };
      const statusChanges = t.status !== "Assigned";
      const { data: moved } = await admin
        .from("tickets")
        .update({
          // A new deadline window starts for the new assignee.
          sla_due_at: computeSlaDueAt(t.module, t.category, t.priority).toISOString(),
          sla_started_at: nowIso,
          sla_reminded_at: null,
          assigned_to: pick.id,
          assigned_auto: true,
          reassign_count: t.reassign_count + 1,
          assignment_history: [...history, entry],
          ...(statusChanges ? { status: "Assigned" } : {}),
        })
        .eq("id", t.id)
        .select("id");
      if (moved?.length) {
        await admin.from("profiles").update({ last_assigned_at: nowIso }).eq("id", pick.id);
        const events: Record<string, unknown>[] = [
          {
            ticket_id: t.id,
            ...SYSTEM_ACTOR,
            type: "assigned",
            note: oldName
              ? `Reassigned from ${oldName} to ${pick.name}: deadline missed (${pick.reason})`
              : `Auto-assigned to ${pick.name}: deadline missed while unassigned (${pick.reason})`,
          },
        ];
        if (statusChanges) events.push({ ticket_id: t.id, ...SYSTEM_ACTOR, type: "status_change", from_status: t.status, to_status: "Assigned" });
        await admin.from("ticket_events").insert(events);

        const subject = `${t.ticket_no} reassigned: ${oldName ?? "unassigned"} → ${pick.name}`;
        notifyStaffAlert({
          ticketId: t.id,
          recipientIds: wardenIds,
          template: "sla_reassigned",
          title: subject,
          message: `${t.ticket_no} (${t.title}) missed its deadline and was reassigned from ${oldName ?? "nobody"} to ${pick.name}.`,
        });
        if (t.assigned_to) {
          notifyStaffAlert({
            ticketId: t.id,
            recipientIds: [t.assigned_to],
            template: "sla_reassigned",
            title: `${t.ticket_no} was taken off you`,
            message: `${t.ticket_no} (${t.title}) missed its deadline and was reassigned to ${pick.name}.`,
          });
        }
        notifyStaffAlert({
          ticketId: t.id,
          recipientIds: [pick.id],
          template: "sla_reassigned",
          title: `${t.ticket_no} reassigned to you`,
          message: `${t.ticket_no} (${t.title}) missed its deadline with ${oldName ?? "nobody"} and is now yours. A new deadline has started.`,
          push: "job",
        });
        if (statusChanges) notifyTicketStatus(t.id, "Assigned");
        result.reassigned++;
      }
    }
  }

  // Second missed deadline → escalate to the Dean / HOD.
  if (breachCount >= 2) {
    const { created } = await createSlaBreachEscalation({ id: t.id, module: t.module, escalated: t.escalated });
    if (created) result.escalated++;
  }
}
