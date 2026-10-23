import "server-only";
import { BOARD_COLUMNS, OPEN_STATUSES, type TicketStatus } from "@/config/statuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Ticket, TicketEvent } from "@/lib/types";
import { ASSIGNABLE_ROLES, boardScope, canViewStaffTicket, type Viewer } from "./access";

export interface BoardTicket extends Ticket {
  /** Students who joined with "Me too" (not counting the reporter). */
  follower_count: number;
}

export interface StaffMember {
  id: string;
  full_name: string;
  department: string | null;
  role: Profile["role"];
}

export interface BoardStats {
  open: number;
  urgent: number;
  duplicates: number;
  resolvedToday: number;
}

export interface BoardData {
  tickets: BoardTicket[];
  staff: StaffMember[];
  stats: BoardStats;
}

const BOARD_STATUSES: TicketStatus[] = [...BOARD_COLUMNS, "Reopened"];

/** Applies the viewer's scope (same rules as RLS) to a tickets query. */
function scoped<Q>(query: Q, scope: NonNullable<ReturnType<typeof boardScope>>): Q {
  // Typed loosely on purpose: supabase-js builder generics are too deep to constrain here.
  type Filterable = { eq(column: string, value: string): Filterable; or(filters: string): Filterable };
  let q = query as unknown as Filterable;
  if (scope.module) q = q.eq("module", scope.module);
  if (scope.or) q = q.or(scope.or);
  return q as unknown as Q;
}

/** Midnight today in India (the college's time zone), as an ISO string. */
function startOfTodayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3600_000).toISOString();
}

async function followerCounts(ticketIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ticketIds.length === 0) return counts;
  const supabase = await createClient();
  const { data } = await supabase.from("ticket_followers").select("ticket_id").in("ticket_id", ticketIds);
  for (const row of data ?? []) counts.set(row.ticket_id, (counts.get(row.ticket_id) ?? 0) + 1);
  return counts;
}

export async function listAssignableStaff(): Promise<StaffMember[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, department, role")
    .in("role", ASSIGNABLE_ROLES)
    .order("full_name");
  return (data ?? []) as StaffMember[];
}

/** Everything the board needs. Uses the viewer's own session, so RLS applies too. */
export async function getBoardData(viewer: Viewer): Promise<BoardData> {
  const scope = boardScope(viewer);
  if (!scope) return { tickets: [], staff: [], stats: { open: 0, urgent: 0, duplicates: 0, resolvedToday: 0 } };
  const supabase = await createClient();

  const [ticketsRes, resolvedRes, staff] = await Promise.all([
    scoped(supabase.from("tickets").select("*"), scope)
      .in("status", BOARD_STATUSES)
      .order("created_at", { ascending: false })
      .limit(300),
    scoped(supabase.from("tickets").select("id", { count: "exact", head: true }), scope).gte(
      "resolved_at",
      startOfTodayIST(),
    ),
    listAssignableStaff(),
  ]);
  if (ticketsRes.error) console.error("[getBoardData]", ticketsRes.error.message);

  const rows = (ticketsRes.data ?? []) as Ticket[];
  const counts = await followerCounts(rows.map((t) => t.id));
  const tickets = rows.map((t) => ({ ...t, follower_count: counts.get(t.id) ?? 0 }));
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));

  return {
    tickets,
    staff,
    stats: {
      open: open.length,
      urgent: open.filter((t) => t.priority === "Urgent").length,
      duplicates: tickets.filter((t) => t.duplicate_status === "flagged").length,
      resolvedToday: resolvedRes.count ?? 0,
    },
  };
}

export interface ReporterInfo {
  full_name: string;
  roll_no: string | null;
  hostel: string | null;
  wing: string | null;
  room: string | null;
}

export interface DuplicateOriginal {
  id: string;
  ticket_no: string;
  title: string;
  summary: string | null;
  status: TicketStatus;
  building: string | null;
  floor: string | null;
  spot: string | null;
  machine_id: string | null;
  photo_url: string | null;
  created_at: string;
  /** Reporter + "Me too" followers. */
  reporter_count: number;
}

export interface StaffTicketDetail {
  ticket: Ticket;
  events: TicketEvent[];
  reporter: ReporterInfo | null;
  followerCount: number;
  /** Set when duplicate_of points somewhere (flagged or merged). */
  original: DuplicateOriginal | null;
}

/** Full ticket for the staff drawer, or null if the viewer may not see it. */
export async function getStaffTicketDetail(ticketNo: string, viewer: Viewer): Promise<StaffTicketDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tickets").select("*").eq("ticket_no", ticketNo).maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket || !canViewStaffTicket(viewer, ticket)) return null;

  const [eventsRes, reporterRes, followersRes] = await Promise.all([
    supabase.from("ticket_events").select("*").eq("ticket_id", ticket.id).order("created_at", { ascending: true }),
    supabase.from("profiles").select("full_name, roll_no, hostel, wing, room").eq("id", ticket.reporter_id).maybeSingle(),
    supabase.from("ticket_followers").select("user_id", { count: "exact", head: true }).eq("ticket_id", ticket.id),
  ]);

  let original: DuplicateOriginal | null = null;
  if (ticket.duplicate_of) {
    // The viewer is allowed to see this ticket, so showing a summary of the ticket
    // it duplicates is fine even if that one sits in another department.
    const admin = createAdminClient();
    const [{ data: orig }, { count }] = await Promise.all([
      admin
        .from("tickets")
        .select("id, ticket_no, title, summary, status, building, floor, spot, machine_id, photo_url, created_at")
        .eq("id", ticket.duplicate_of)
        .maybeSingle(),
      admin.from("ticket_followers").select("user_id", { count: "exact", head: true }).eq("ticket_id", ticket.duplicate_of),
    ]);
    if (orig) original = { ...(orig as Omit<DuplicateOriginal, "reporter_count">), reporter_count: 1 + (count ?? 0) };
  }

  return {
    ticket,
    events: (eventsRes.data ?? []) as TicketEvent[],
    reporter: (reporterRes.data as ReporterInfo | null) ?? null,
    followerCount: followersRes.count ?? 0,
    original,
  };
}
