import "server-only";
import type { Role } from "@/config/roles";
import { CONCERN_ACK_HOURS } from "@/config/feedback";
import type { TicketStatus } from "@/config/statuses";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TicketEvent } from "@/lib/types";

/**
 * Reads for formal concerns about a teacher (CLAUDE.md §22), HOD and Dean only. Service role with an
 * explicit column list: `reporter_id` is never selected here, so no page or API response can carry it.
 * The only way to see who filed a concern is `revealIdentity` (Dean, with a reason, audited).
 */
export const CONCERN_VIEW_ROLES: Role[] = ["hod", "dean"];

export interface ConcernListItem {
  ticket_no: string;
  status: TicketStatus;
  concern_category: string;
  teacher_name: string;
  subject: string;
  neutral_summary: string | null;
  unchecked: boolean;
  acknowledged_at: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  /** When the 72h acknowledgement window ends (null once acknowledged). */
  ack_due_at: string | null;
  created_at: string;
}

export interface ConcernDetail extends ConcernListItem {
  ticket_id: string;
  title: string;
  original_text: string;
  happened_when: string | null;
  photo_url: string | null;
  term: string;
  events: TicketEvent[];
}

interface Row {
  id: string;
  ticket_id: string;
  teacher_id: string;
  subject: string;
  term: string;
  concern_category: string;
  happened_when: string | null;
  neutral_summary: string | null;
  moderation: "passed" | "unchecked";
  acknowledged_at: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  created_at: string;
  tickets: { ticket_no: string; status: TicketStatus; title: string; original_text: string; photo_url: string | null };
}

const SELECT =
  "id, ticket_id, teacher_id, subject, term, concern_category, happened_when, neutral_summary, moderation, acknowledged_at, escalated_at, escalation_reason, created_at, tickets!inner(ticket_no, status, title, original_text, photo_url)";

function toItem(r: Row, teacherName: string): ConcernListItem {
  return {
    ticket_no: r.tickets.ticket_no,
    status: r.tickets.status,
    concern_category: r.concern_category,
    teacher_name: teacherName,
    subject: r.subject,
    neutral_summary: r.neutral_summary,
    unchecked: r.moderation === "unchecked",
    acknowledged_at: r.acknowledged_at,
    escalated_at: r.escalated_at,
    escalation_reason: r.escalation_reason,
    ack_due_at: r.acknowledged_at ? null : new Date(new Date(r.created_at).getTime() + CONCERN_ACK_HOURS * 3_600_000).toISOString(),
    created_at: r.created_at,
  };
}

async function teacherNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, full_name").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((p) => [p.id as string, p.full_name as string]));
}

export async function listConcerns(): Promise<ConcernListItem[]> {
  const { data, error } = await createAdminClient().from("teacher_concerns").select(SELECT).order("created_at", { ascending: false }).limit(200);
  if (error) console.error("[listConcerns]", error.message);
  const rows = (data ?? []) as unknown as Row[];
  const names = await teacherNames(rows.map((r) => r.teacher_id));
  return rows.map((r) => toItem(r, names.get(r.teacher_id) ?? "Unknown teacher"));
}

export async function getConcern(ticketNo: string): Promise<ConcernDetail | null> {
  const admin = createAdminClient();
  const { data: ticket } = await admin.from("tickets").select("id").eq("ticket_no", ticketNo).eq("teacher_complaint", true).maybeSingle();
  if (!ticket) return null;
  const { data } = await admin.from("teacher_concerns").select(SELECT).eq("ticket_id", ticket.id).maybeSingle();
  const row = data as unknown as Row | null;
  if (!row) return null;
  const [names, { data: events }] = await Promise.all([
    teacherNames([row.teacher_id]),
    admin.from("ticket_events").select("*").eq("ticket_id", ticket.id).order("created_at", { ascending: true }),
  ]);
  return {
    ...toItem(row, names.get(row.teacher_id) ?? "Unknown teacher"),
    ticket_id: ticket.id,
    title: row.tickets.title,
    original_text: row.tickets.original_text,
    happened_when: row.happened_when,
    photo_url: row.tickets.photo_url,
    term: row.term,
    events: (events ?? []) as TicketEvent[],
  };
}

/** How many concerns are waiting for an acknowledgement (nav / home badges). */
export async function countOpenConcerns(): Promise<number> {
  const { count } = await createAdminClient().from("teacher_concerns").select("id", { count: "exact", head: true }).is("acknowledged_at", null);
  return count ?? 0;
}

export interface RevealLogItem {
  id: string;
  ticket_no: string;
  revealer_name: string;
  reason: string;
  created_at: string;
}

/** The Dean's audit trail of identity reveals. */
export async function listRevealLog(): Promise<RevealLogItem[]> {
  const { data, error } = await createAdminClient()
    .from("identity_reveal_log")
    .select("id, ticket_no, revealer_name, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) console.error("[listRevealLog]", error.message);
  return (data ?? []) as RevealLogItem[];
}
