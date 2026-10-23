import "server-only";
import { CONFIDENTIAL_REPORTER } from "@/config/safety";
import { CLOSED_ON_BOARD_DAYS, OPEN_STATUSES, TICKET_STATUSES, type TicketStatus } from "@/config/statuses";
import { hotspotKey } from "@/lib/hotspots";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { EscalationReason, EscalationStatus, Profile, Ticket, TicketEvent } from "@/lib/types";
import { ASSIGNABLE_ROLES, boardScope, canSeeReporter, canViewStaffTicket, type Viewer } from "./access";

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
  /** Department staff only: tickets this person moved to Resolved, and their average rating. */
  mine: { resolved: number; avgRating: number | null; ratedCount: number } | null;
}

export interface BoardData {
  tickets: BoardTicket[];
  staff: StaffMember[];
  stats: BoardStats;
}

/** Live work on the board (Closed comes from a separate "recent" query). */
const ACTIVE_BOARD_STATUSES: TicketStatus[] = ["Submitted", "Assigned", "In Progress", "Resolved", "Reopened"];

type Scope = NonNullable<ReturnType<typeof boardScope>>;

/** Applies the viewer's scope (same rules as RLS) to a tickets query. */
export function scoped<Q>(query: Q, scope: Scope): Q {
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

async function withFollowers(rows: Ticket[]): Promise<BoardTicket[]> {
  const counts = await followerCounts(rows.map((t) => t.id));
  return rows.map((t) => ({ ...t, follower_count: counts.get(t.id) ?? 0 }));
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

/** "Resolved by me" + average rating of tickets assigned to me. */
async function myStats(viewer: Viewer): Promise<BoardStats["mine"]> {
  if (!["staff", "academic_office", "security_officer", "arc"].includes(viewer.role)) return null;
  const supabase = await createClient();
  const [resolvedRes, ratedRes] = await Promise.all([
    supabase.from("ticket_events").select("ticket_id").eq("actor_id", viewer.id).eq("to_status", "Resolved"),
    supabase.from("tickets").select("rating").eq("assigned_to", viewer.id).not("rating", "is", null),
  ]);
  const ratings = (ratedRes.data ?? []).map((r) => r.rating as number);
  return {
    resolved: new Set((resolvedRes.data ?? []).map((r) => r.ticket_id)).size,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    ratedCount: ratings.length,
  };
}

/** Everything the board needs. Uses the viewer's own session, so RLS applies too. */
export async function getBoardData(viewer: Viewer): Promise<BoardData> {
  const scope = boardScope(viewer);
  if (!scope) {
    return { tickets: [], staff: [], stats: { open: 0, urgent: 0, duplicates: 0, resolvedToday: 0, mine: null } };
  }
  const supabase = await createClient();
  const closedSince = new Date(Date.now() - CLOSED_ON_BOARD_DAYS * 86_400_000).toISOString();

  const [activeRes, closedRes, resolvedRes, staff, mine] = await Promise.all([
    scoped(supabase.from("tickets").select("*"), scope)
      .in("status", ACTIVE_BOARD_STATUSES)
      .order("created_at", { ascending: false })
      .limit(300),
    scoped(supabase.from("tickets").select("*"), scope)
      .eq("status", "Closed")
      .gte("updated_at", closedSince)
      .order("updated_at", { ascending: false })
      .limit(60),
    scoped(supabase.from("tickets").select("id", { count: "exact", head: true }), scope).gte(
      "resolved_at",
      startOfTodayIST(),
    ),
    listAssignableStaff(),
    myStats(viewer),
  ]);
  if (activeRes.error) console.error("[getBoardData]", activeRes.error.message);
  if (closedRes.error) console.error("[getBoardData] closed", closedRes.error.message);

  const tickets = await withFollowers([...((activeRes.data ?? []) as Ticket[]), ...((closedRes.data ?? []) as Ticket[])]);
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));

  return {
    tickets,
    staff,
    stats: {
      open: open.length,
      urgent: open.filter((t) => t.priority === "Urgent").length,
      duplicates: tickets.filter((t) => t.duplicate_status === "flagged").length,
      resolvedToday: resolvedRes.count ?? 0,
      mine,
    },
  };
}

// ---------------------------------------------------------------------------
// History / All tickets
// ---------------------------------------------------------------------------
export interface HistoryFilters {
  status: TicketStatus | null;
  from: string | null;
  to: string | null;
  category: string | null;
  assignee: string | null;
  /** "1".."5" = exact stars, "unrated" = closed without rating. */
  rating: string | null;
  q: string | null;
}

export function parseHistoryFilters(sp: Record<string, string | undefined>): HistoryFilters {
  const date = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    status: TICKET_STATUSES.find((s) => s === sp.status) ?? null,
    from: date(sp.from),
    to: date(sp.to),
    category: sp.category || null,
    assignee: sp.assignee && /^[0-9a-f-]{36}$/i.test(sp.assignee) ? sp.assignee : null,
    rating: sp.rating && /^([1-5]|unrated)$/.test(sp.rating) ? sp.rating : null,
    q: sp.q?.trim() || null,
  };
}

/** Every ticket the viewer may see (any status), newest first, with filters. */
export async function listTicketHistory(viewer: Viewer, f: HistoryFilters): Promise<BoardTicket[]> {
  const scope = boardScope(viewer);
  if (!scope) return [];
  const supabase = await createClient();
  let q = scoped(supabase.from("tickets").select("*"), scope).order("created_at", { ascending: false }).limit(300);
  if (f.status) q = q.eq("status", f.status);
  // Dates are IST calendar days.
  if (f.from) q = q.gte("created_at", new Date(`${f.from}T00:00:00+05:30`).toISOString());
  if (f.to) q = q.lt("created_at", new Date(new Date(`${f.to}T00:00:00+05:30`).getTime() + 86_400_000).toISOString());
  if (f.category) q = q.eq("category", f.category);
  if (f.assignee) q = q.eq("assigned_to", f.assignee);
  if (f.rating === "unrated") q = q.eq("status", "Closed").is("rating", null);
  else if (f.rating) q = q.eq("rating", Number(f.rating));
  if (f.q) {
    const ticketNo = f.q.match(/^(?:cc)?[-\s]?(\d+)$/i);
    const text = f.q.replace(/[,()"%]/g, " ");
    q = ticketNo ? q.ilike("ticket_no", `%${ticketNo[1]}%`) : q.or(`title.ilike.%${text}%,original_text.ilike.%${text}%`);
  }
  const { data, error } = await q;
  if (error) console.error("[listTicketHistory]", error.message);
  return withFollowers((data ?? []) as Ticket[]);
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

export interface LinkedEscalation {
  id: string;
  reason: EscalationReason;
  status: EscalationStatus;
}

export interface StaffTicketDetail {
  ticket: Ticket;
  /** Escalations covering this ticket (only for roles that can open them: warden/dean/HOD). */
  escalations: LinkedEscalation[];
  events: TicketEvent[];
  reporter: ReporterInfo | null;
  /** True when the reporter asked to hide their name and this viewer may not see it. */
  reporterHidden: boolean;
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

  const key = hotspotKey(ticket);
  const reporterHidden = !canSeeReporter(viewer, ticket);
  const [eventsRes, reporterRes, followersRes, escRes] = await Promise.all([
    supabase.from("ticket_events").select("*").eq("ticket_id", ticket.id).order("created_at", { ascending: true }),
    // Admin client: security officers can't read student profiles under RLS, but may see
    // the reporter of tickets they handle unless the student hid their name.
    reporterHidden
      ? Promise.resolve({ data: null })
      : createAdminClient()
          .from("profiles")
          .select("full_name, roll_no, hostel, wing, room")
          .eq("id", ticket.reporter_id)
          .maybeSingle(),
    supabase.from("ticket_followers").select("user_id", { count: "exact", head: true }).eq("ticket_id", ticket.id),
    // RLS returns nothing for department staff, which is what we want.
    supabase
      .from("escalations")
      .select("id, reason, status")
      .or(key ? `ticket_id.eq.${ticket.id},hotspot_key.eq."${key}"` : `ticket_id.eq.${ticket.id}`)
      .order("created_at", { ascending: false }),
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

  let events = (eventsRes.data ?? []) as TicketEvent[];
  if (reporterHidden) {
    events = events.map((e) =>
      e.actor_id === ticket.reporter_id ? { ...e, actor_id: null, actor_name: CONFIDENTIAL_REPORTER } : e,
    );
  }

  return {
    ticket: reporterHidden ? { ...ticket, reporter_id: "" } : ticket,
    escalations: (escRes.data ?? []) as LinkedEscalation[],
    events,
    reporter: (reporterRes.data as ReporterInfo | null) ?? null,
    reporterHidden,
    followerCount: followersRes.count ?? 0,
    original,
  };
}
