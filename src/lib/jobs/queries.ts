import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Ticket } from "@/lib/types";
import type { JobsData, JobTicket } from "./types";

const ACTIVE_STATUSES = ["Assigned", "In Progress", "Reopened"];

/** Midnight today in India (the college's time zone), as an ISO string. */
function startOfTodayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000).toISOString();
}

/** Strips a ticket down to what the simple view shows. Confidential cases keep almost nothing. */
export function toJobTicket(t: Ticket, followers: number): JobTicket {
  const confidential = t.is_confidential;
  const hindi = (t.ai_meta as { title_hi?: unknown } | null)?.title_hi;
  return {
    id: t.id,
    ticket_no: t.ticket_no,
    status: t.status,
    priority: t.priority,
    category: t.category,
    module: t.module,
    title: confidential ? null : t.title,
    title_hi: !confidential && typeof hindi === "string" ? hindi : null,
    building: t.building,
    floor: t.floor,
    room_no: confidential ? null : t.room_no,
    spot: t.spot,
    machine_id: confidential ? null : t.machine_id,
    photo_url: confidential ? null : t.photo_url,
    sla_due_at: t.sla_due_at,
    sla_paused_at: t.sla_paused_at,
    waiting_reason: confidential ? null : t.waiting_reason,
    confidential,
    reopen_count: t.reopen_count,
    affected: confidential ? 1 : 1 + followers,
    resolved_at: t.resolved_at,
  };
}

export async function followerCountsFor(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const supabase = await createClient();
  const { data } = await supabase.from("ticket_followers").select("ticket_id").in("ticket_id", ids);
  for (const row of data ?? []) counts.set(row.ticket_id, (counts.get(row.ticket_id) ?? 0) + 1);
  return counts;
}

/** The tickets assigned to this person (their own session, so RLS applies as well). */
export async function getMyJobs(userId: string): Promise<JobsData> {
  const supabase = await createClient();
  const [activeRes, doneRes] = await Promise.all([
    supabase
      .from("tickets")
      .select("*")
      .eq("assigned_to", userId)
      .eq("teacher_complaint", false)
      .in("status", ACTIVE_STATUSES)
      .limit(200),
    supabase
      .from("tickets")
      .select("*")
      .eq("assigned_to", userId)
      .eq("teacher_complaint", false)
      .in("status", ["Resolved", "Closed"])
      .gte("resolved_at", startOfTodayIST())
      .order("resolved_at", { ascending: false })
      .limit(100),
  ]);
  if (activeRes.error) console.error("[getMyJobs]", activeRes.error.message);
  if (doneRes.error) console.error("[getMyJobs] done", doneRes.error.message);

  const active = (activeRes.data ?? []) as Ticket[];
  const done = (doneRes.data ?? []) as Ticket[];
  const counts = await followerCountsFor([...active, ...done].map((t) => t.id));
  return {
    active: active.map((t) => toJobTicket(t, counts.get(t.id) ?? 0)),
    doneToday: done.map((t) => toJobTicket(t, counts.get(t.id) ?? 0)),
    serverNow: Date.now(),
  };
}

