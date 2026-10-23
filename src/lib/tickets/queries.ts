import "server-only";
import { INTERNAL_EVENT_TYPES, TICKET_STATUSES } from "@/config/statuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Ticket, TicketEvent } from "@/lib/types";

export type TicketFilter = "active" | "resolved";
const DONE_STATUSES = ["Resolved", "Closed", "Merged"];

export interface MyTicket extends Ticket {
  /** True when the student joined this ticket with "Me too" (not the reporter). */
  following: boolean;
}

/** Tickets the student reported or follows. RLS limits students to exactly those. */
export async function listMyTickets(userId: string, filter: TicketFilter): Promise<MyTicket[]> {
  const supabase = await createClient();
  let query = supabase.from("tickets").select("*").order("created_at", { ascending: false }).limit(100);
  query =
    filter === "resolved"
      ? query.in("status", DONE_STATUSES)
      : query.not("status", "in", `(${DONE_STATUSES.join(",")})`);
  const { data, error } = await query;
  if (error) console.error("[listMyTickets]", error.message);
  return ((data ?? []) as Ticket[]).map((t) => ({ ...t, following: t.reporter_id !== userId }));
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

  let mergedInto: string | null = null;
  if (ticket.duplicate_of && ticket.duplicate_status === "merged") {
    const { data: orig } = await createAdminClient()
      .from("tickets")
      .select("ticket_no")
      .eq("id", ticket.duplicate_of)
      .maybeSingle();
    mergedInto = orig?.ticket_no ?? null;
  }
  return { ticket, events: (events ?? []) as TicketEvent[], mergedInto };
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
    .maybeSingle();
  if (!data) return null;
  const ticket = data as TrackedTicket;
  if (!TICKET_STATUSES.includes(ticket.status)) return null;

  const { data: events } = await admin
    .from("ticket_events")
    .select("id, ticket_id, type, from_status, to_status, actor_role, actor_name, created_at")
    .eq("ticket_id", ticket.id)
    .not("type", "in", `(${INTERNAL_EVENT_TYPES.join(",")})`)
    .order("created_at", { ascending: true });

  // Basic view: no notes (they can contain room numbers / personal remarks), and
  // other students are shown as "A student".
  const safe = ((events ?? []) as Omit<TicketEvent, "note" | "actor_id">[]).map((e) => ({
    ...e,
    actor_id: null,
    note: null,
    actor_name: e.actor_role === "student" ? "A student" : e.actor_name,
  }));
  return { ticket, events: safe };
}
