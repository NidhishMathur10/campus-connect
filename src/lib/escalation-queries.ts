import "server-only";
import type { TicketModule } from "@/config/routing";
import { OPEN_STATUSES } from "@/config/statuses";
import { escalationWhere, linkedTickets } from "@/lib/escalations";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/tickets/access";
import type { Escalation, EscalationStatus, Ticket, TicketEvent } from "@/lib/types";

/** Whose inbox: Dean → hostel escalations, HOD → academic, warden → hostel (view only). */
export function escalationModule(viewer: Viewer): TicketModule | null {
  if (viewer.role === "dean" || viewer.role === "warden") return "hostel";
  if (viewer.role === "hod") return "academic";
  return null;
}

/** Only the target (Dean / HOD) acknowledges, adds directives and resolves. */
export function canActOnEscalation(viewer: Viewer, esc: Pick<Escalation, "target_role">): boolean {
  return (viewer.role === "dean" && esc.target_role === "dean") || (viewer.role === "hod" && esc.target_role === "hod");
}

export type EscalationTab = "active" | EscalationStatus | "all";

export interface EscalationListItem extends Escalation {
  where: string;
  ticket_count: number;
  open_ticket_count: number;
}

export async function listEscalations(viewer: Viewer, tab: EscalationTab): Promise<EscalationListItem[]> {
  const scopeModule = escalationModule(viewer);
  if (!scopeModule) return [];
  const supabase = await createClient(); // RLS: dean/hod/warden only see their part
  let q = supabase.from("escalations").select("*").eq("module", scopeModule).order("created_at", { ascending: false }).limit(100);
  if (tab === "active") q = q.in("status", ["open", "acknowledged"]);
  else if (tab !== "all") q = q.eq("status", tab);
  const { data, error } = await q;
  if (error) console.error("[listEscalations]", error.message);

  const admin = createAdminClient();
  return Promise.all(
    ((data ?? []) as Escalation[]).map(async (e) => {
      const tickets = await linkedTickets(admin, e);
      return {
        ...e,
        where: escalationWhere(e, tickets),
        ticket_count: tickets.length,
        open_ticket_count: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
      };
    }),
  );
}

export interface EscalationDetail {
  escalation: Escalation;
  where: string;
  tickets: (Ticket & { follower_count: number; events: TicketEvent[] })[];
  /** True when every linked ticket is Closed or Merged (so it can be marked resolved). */
  allClosed: boolean;
}

export async function getEscalationDetail(id: string, viewer: Viewer): Promise<EscalationDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const scopeModule = escalationModule(viewer);
  const supabase = await createClient();
  const { data } = await supabase.from("escalations").select("*").eq("id", id).maybeSingle();
  const escalation = data as Escalation | null;
  if (!escalation || escalation.module !== scopeModule) return null;

  const admin = createAdminClient();
  const tickets = await linkedTickets(admin, escalation);
  const ids = tickets.map((t) => t.id);
  const [{ data: events }, { data: followers }] = await Promise.all([
    ids.length
      ? admin.from("ticket_events").select("*").in("ticket_id", ids).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    ids.length ? admin.from("ticket_followers").select("ticket_id").in("ticket_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const evs = (events ?? []) as TicketEvent[];
  const fol = (followers ?? []) as { ticket_id: string }[];

  return {
    escalation,
    where: escalationWhere(escalation, tickets),
    tickets: tickets.map((t) => ({
      ...t,
      follower_count: fol.filter((f) => f.ticket_id === t.id).length,
      events: evs.filter((e) => e.ticket_id === t.id),
    })),
    allClosed: tickets.length > 0 && tickets.every((t) => t.status === "Closed" || t.status === "Merged"),
  };
}

/** True when the background brief job seems to have been missed (no brief after a minute). */
export function briefMissing(e: Pick<Escalation, "brief_model" | "created_at">): boolean {
  return !e.brief_model && Date.now() - new Date(e.created_at).getTime() > 60_000;
}

export interface HomeStats {
  openEscalations: number;
  acknowledged: number;
  openTickets: number;
  overdueTickets: number;
  closedLast30: number;
  avgRating: number | null;
}

/** Key numbers for the Dean/HOD home (top of the Escalations page). */
export async function getHomeStats(viewer: Viewer): Promise<HomeStats | null> {
  const scopeModule = escalationModule(viewer);
  if (!scopeModule) return null;
  const supabase = await createClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [escRes, ticketsRes, closedRes] = await Promise.all([
    supabase.from("escalations").select("status").eq("module", scopeModule).in("status", ["open", "acknowledged"]),
    supabase.from("tickets").select("status, sla_due_at").eq("module", scopeModule).in("status", OPEN_STATUSES),
    supabase.from("tickets").select("rating").eq("module", scopeModule).eq("status", "Closed").gte("updated_at", since),
  ]);
  const esc = escRes.data ?? [];
  const open = ticketsRes.data ?? [];
  const closed = closedRes.data ?? [];
  const ratings = closed.map((r) => r.rating as number | null).filter((r): r is number => r != null);
  const now = new Date().toISOString();
  return {
    openEscalations: esc.filter((e) => e.status === "open").length,
    acknowledged: esc.filter((e) => e.status === "acknowledged").length,
    openTickets: open.length,
    overdueTickets: open.filter((t) => t.sla_due_at && t.sla_due_at < now).length,
    closedLast30: closed.length,
    avgRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
  };
}
