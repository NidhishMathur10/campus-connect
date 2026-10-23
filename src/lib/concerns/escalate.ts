import "server-only";
import { CONCERN_ACK_HOURS } from "@/config/feedback";
import { notifyConcernEscalated, notifyConcernStudent } from "@/lib/email/concern-notify";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Concern -> Dean escalation (CLAUDE.md §22). Concerns carry their own escalation state instead of rows in
 * `escalations`, so a confidential concern never shows up in the generic escalation lists or briefs.
 */
export type ConcernEscalationReason = "unacknowledged" | "discrimination" | "manual";

const WHY: Record<ConcernEscalationReason, string> = {
  unacknowledged: `it was not acknowledged within ${CONCERN_ACK_HOURS} hours`,
  discrimination: "discrimination concerns go straight to the Dean",
  manual: "the Head of Department escalated it",
};

/** Idempotent: a guarded UPDATE claims the concern, so two callers cannot escalate it twice. */
export async function escalateConcern(concernId: string, reason: ConcernEscalationReason): Promise<boolean> {
  const admin = createAdminClient();
  const { data: claimed } = await admin
    .from("teacher_concerns")
    .update({ escalated_at: new Date().toISOString(), escalation_reason: reason })
    .eq("id", concernId)
    .is("escalated_at", null)
    .select("ticket_id, concern_category");
  const concern = claimed?.[0];
  if (!concern) return false;

  const { data: ticket } = await admin
    .from("tickets")
    .update({ escalated: true })
    .eq("id", concern.ticket_id)
    .select("ticket_no, reporter_id")
    .single();
  await admin.from("ticket_events").insert({
    ticket_id: concern.ticket_id,
    actor_id: null,
    actor_name: "CampusConnect",
    actor_role: null,
    type: "escalated",
    note: `Escalated to the Dean's office: ${WHY[reason]}.`,
  });
  if (ticket) {
    notifyConcernEscalated(ticket.ticket_no, concern.concern_category, WHY[reason]);
    notifyConcernStudent(ticket.reporter_id, ticket.ticket_no, `Your concern ${ticket.ticket_no} was escalated`, "It has been passed to the Dean's office for priority attention. Nothing about you was shared.", { inApp: false });
  }
  return true;
}

/** Not acknowledged by the HOD within 72h -> Dean. Called by the SLA watcher and when HOD / Dean pages load. */
export async function escalateStaleConcerns(): Promise<number> {
  const cutoff = new Date(Date.now() - CONCERN_ACK_HOURS * 3_600_000).toISOString();
  const { data } = await createAdminClient()
    .from("teacher_concerns")
    .select("id")
    .is("acknowledged_at", null)
    .is("escalated_at", null)
    .lt("created_at", cutoff);
  let n = 0;
  for (const c of data ?? []) if (await escalateConcern(c.id, "unacknowledged")) n += 1;
  return n;
}
