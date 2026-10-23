import "server-only";
import { DONE_STATUSES, INTERNAL_EVENT_TYPES, TICKET_STATUSES } from "@/config/statuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Ticket, TicketEvent } from "@/lib/types";

export type TicketFilter = "active" | "completed";

export interface MyTicket extends Ticket {
  /** True when the student joined this ticket with "Me too" (not the reporter). */
  following: boolean;
  /** Ticket number this one was merged into, if any. */
  merged_into: string | null;
}

/** Ids of the tickets a user joined with "Me too". */
export async function followedTicketIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("ticket_followers").select("ticket_id").eq("user_id", userId);
  return (data ?? []).map((r) => r.ticket_id as string);
}

/**
 * Tickets the user reported or follows. Students are limited to exactly those by RLS; the
 * explicit filter also keeps HOD / Academic Office users (who can see their department's
 * tickets) to their own reports.
 * Active = still being worked on (incl. Resolved awaiting confirmation); Completed = Closed + Merged.
 */
export async function listMyTickets(userId: string, filter: TicketFilter): Promise<MyTicket[]> {
  const supabase = await createClient();
  const followed = await followedTicketIds(userId);
  let query = supabase
    .from("tickets")
    .select("*")
    .or(followed.length ? `reporter_id.eq.${userId},id.in.(${followed.join(",")})` : `reporter_id.eq.${userId}`)
    .order("updated_at", { ascending: false })
    .limit(100);
  query =
    filter === "completed"
      ? query.in("status", DONE_STATUSES)
      : query.not("status", "in", `(${DONE_STATUSES.join(",")})`);
  const { data, error } = await query;
  if (error) console.error("[listMyTickets]", error.message);
  const tickets = (data ?? []) as Ticket[];

  // Original ticket numbers for merged duplicates (the student may not follow the original yet).
  const originalIds = [...new Set(tickets.filter((t) => t.status === "Merged" && t.duplicate_of).map((t) => t.duplicate_of!))];
  const originals = new Map<string, string>();
  if (originalIds.length) {
    const { data: rows } = await createAdminClient().from("tickets").select("id, ticket_no").in("id", originalIds);
    for (const r of rows ?? []) originals.set(r.id, r.ticket_no);
  }
  return tickets.map((t) => ({
    ...t,
    following: t.reporter_id !== userId,
    merged_into: t.duplicate_of ? (originals.get(t.duplicate_of) ?? null) : null,
  }));
}

/** Full ticket + timeline, if the current user may see it (RLS decides). */
export async function getVisibleTicket(
  ticketNo: string,
): Promise<{ ticket: Ticket; events: TicketEvent[]; mergedInto: string | null } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tickets").select("*").eq("ticket_no", ticketNo).maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket) return null;
  const { data: events } = await supabase
    .from("ticket_events")
    .select("*")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  // Reporters never see internal-only events (RLS hides them from students and teachers;
  // HOD / Academic Office users could otherwise read them as staff).
  const visibleEvents = ((events ?? []) as TicketEvent[]).filter(
    (e) => !e.is_internal && !INTERNAL_EVENT_TYPES.includes(e.type),
  );

  let mergedInto: string | null = null;
  if (ticket.duplicate_of && ticket.duplicate_status === "merged") {
    const { data: orig } = await createAdminClient()
      .from("tickets")
      .select("ticket_no")
      .eq("id", ticket.duplicate_of)
      .maybeSingle();
    mergedInto = orig?.ticket_no ?? null;
  }
  return { ticket, events: visibleEvents, mergedInto };
}

/**
 * A ticket the user reported or follows, with its timeline (faculty "My Reports" detail).
 * Returns null for anyone else's ticket, even if their staff role could read it.
 */
export async function getMyTicket(
  ticketNo: string,
  userId: string,
): Promise<{ ticket: Ticket; events: TicketEvent[]; mergedInto: string | null } | null> {
  const full = await getVisibleTicket(ticketNo);
  if (!full) return null;
  if (full.ticket.reporter_id === userId) return full;
  return (await followedTicketIds(userId)).includes(full.ticket.id) ? full : null;
}

/** Public-safe subset for "Track by ticket number" (any signed-in user). */
export interface TrackedTicket {
  id: string;
  ticket_no: string;
  module: Ticket["module"];
  title: string;
  category: string;
  department: string;
  priority: Ticket["priority"];
  status: Ticket["status"];
  building: string | null;
  floor: string | null;
  escalated: boolean;
  created_at: string;
  updated_at: string;
}

export async function trackTicket(
  ticketNo: string,
): Promise<{ ticket: TrackedTicket; events: TicketEvent[] } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tickets")
    .select("id, ticket_no, module, title, category, department, priority, status, building, floor, escalated, created_at, updated_at")
    .eq("ticket_no", ticketNo)
    .neq("module", "security") // safety reports are never trackable by others
    .eq("teacher_complaint", false) // nor are concerns about a teacher
    .maybeSingle();
  if (!data) return null;
  const ticket = data as TrackedTicket;
  if (!TICKET_STATUSES.includes(ticket.status)) return null;

  const { data: events } = await admin
    .from("ticket_events")
    .select("id, ticket_id, type, from_status, to_status, actor_role, actor_name, created_at")
    .eq("ticket_id", ticket.id)
    .not("type", "in", `(${INTERNAL_EVENT_TYPES.join(",")})`)
    .eq("is_internal", false)
    .order("created_at", { ascending: true });

  // Basic view: no notes (they can contain room numbers / personal remarks), and
  // other students are shown as "A student".
  const safe = ((events ?? []) as Omit<TicketEvent, "note" | "actor_id" | "is_internal">[]).map((e) => ({
    ...e,
    actor_id: null,
    note: null,
    is_internal: false,
    actor_name: e.actor_role === "student" ? "A student" : e.actor_role === "teacher" ? "A faculty member" : e.actor_name,
  }));
  return { ticket, events: safe };
}
