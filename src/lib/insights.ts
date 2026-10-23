import "server-only";
import type { TicketModule } from "@/config/routing";
import { ESCALATION_RULES, OPEN_STATUSES, TICKET_STATUSES, type TicketStatus } from "@/config/statuses";
import { normaliseRoom } from "@/config/locations";
import { floorHotspotKey, hotspotKey, hotspotLabel } from "@/lib/hotspots";
import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/tickets/access";
import type { HotspotInsight, Ticket } from "@/lib/types";

const DAY = 86_400_000;
export const INSIGHT_WINDOWS = [7, 30] as const;
export type InsightWindow = (typeof INSIGHT_WINDOWS)[number];

/** Warden → hostel, HOD → academic, Dean → chosen module (null = both). */
export function insightsModule(viewer: Viewer, requested: string | undefined): TicketModule | null | "forbidden" {
  if (viewer.role === "warden") return "hostel";
  if (viewer.role === "hod") return "academic";
  if (viewer.role === "dean") return requested === "hostel" || requested === "academic" ? requested : null;
  return "forbidden";
}

type Row = Pick<
  Ticket,
  | "id"
  | "ticket_no"
  | "module"
  | "title"
  | "category"
  | "department"
  | "building"
  | "floor"
  | "room_no"
  | "spot"
  | "status"
  | "priority"
  | "rating"
  | "sla_due_at"
  | "resolved_at"
  | "created_at"
  | "duplicate_status"
  | "reassign_count"
>;
const COLS = "id, ticket_no, module, title, category, department, building, floor, room_no, spot, status, priority, rating, sla_due_at, resolved_at, created_at, duplicate_status, reassign_count";

export interface Hotspot {
  key: string;
  label: string;
  module: TicketModule;
  /** Several different hostel rooms on one floor (same category, within a week). */
  floorLevel: boolean;
  count: number;
  prevCount: number;
  trend: "up" | "down" | "flat";
  tickets: Pick<Row, "ticket_no" | "title" | "status" | "created_at">[];
  insight: (Pick<HotspotInsight, "recommendation" | "generated_at" | "model"> & { stale: boolean }) | null;
}

export interface DepartmentRow {
  department: string;
  total: number;
  open: number;
  avgResolutionHours: number | null;
  slaBreaches: number;
  /** Times the SLA watcher moved a ticket of this department to another staff member (deadline missed). */
  reassignments: number;
  avgRating: number | null;
}

export interface InsightsData {
  days: InsightWindow;
  stats: {
    total: number;
    open: number;
    avgResolutionHours: number | null;
    withinSlaPct: number | null;
    avgRating: number | null;
    ratedCount: number;
  };
  byCategory: { name: string; count: number }[];
  byBuilding: { name: string; count: number }[];
  daily: { day: string; count: number }[];
  statusBreakdown: { status: TicketStatus; count: number }[];
  hotspots: Hotspot[];
  departments: DepartmentRow[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const hours = (t: Row) => (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()) / 3600_000;
const breached = (t: Row, now: number) =>
  !!t.sla_due_at &&
  (t.resolved_at ? t.resolved_at > t.sla_due_at : OPEN_STATUSES.includes(t.status) && new Date(t.sla_due_at).getTime() < now);

function countBy<T>(items: T[], key: (t: T) => string | null) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/** "23 Oct" in IST. */
function istDay(ms: number) {
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export async function getInsights(module: TicketModule | null, days: InsightWindow): Promise<InsightsData> {
  const supabase = await createClient();
  const now = Date.now();
  const lookback = Math.max(days * 2, 14);
  const since = new Date(now - lookback * DAY).toISOString();

  let recentQ = supabase.from("tickets").select(COLS).gte("created_at", since).limit(3000);
  let openQ = supabase.from("tickets").select(COLS).in("status", OPEN_STATUSES).limit(3000);
  if (module) {
    recentQ = recentQ.eq("module", module);
    openQ = openQ.eq("module", module);
  } else {
    // Safety reports only appear as aggregated counts (getSecurityCounts), never in charts/hotspots.
    recentQ = recentQ.neq("module", "security");
    openQ = openQ.neq("module", "security");
  }
  const [recentRes, openRes] = await Promise.all([recentQ, openQ]);
  if (recentRes.error) console.error("[getInsights]", recentRes.error.message);

  const byId = new Map<string, Row>();
  for (const t of [...((recentRes.data ?? []) as Row[]), ...((openRes.data ?? []) as Row[])]) byId.set(t.id, t);
  const all = [...byId.values()];
  const windowStart = now - days * DAY;
  const inWindow = all.filter((t) => new Date(t.created_at).getTime() >= windowStart);
  const real = inWindow.filter((t) => t.status !== "Merged"); // merged duplicates aren't separate problems
  const resolved = inWindow.filter((t) => t.resolved_at);
  const rated = inWindow.filter((t) => t.rating != null);
  const open = all.filter((t) => OPEN_STATUSES.includes(t.status));

  // Last 14 days, one point per IST day (oldest first).
  const daily = Array.from({ length: 14 }, (_, i) => ({ day: istDay(now - (13 - i) * DAY), count: 0 }));
  for (const t of all) {
    const idx = daily.findIndex((d) => d.day === istDay(new Date(t.created_at).getTime()));
    if (idx >= 0) daily[idx].count++;
  }

  // Hotspots: (a) the same place (hostel room / common area, or academic block + floor) with 2+ tickets in
  // the window; (b) FLOOR-LEVEL: 3+ different rooms on one floor, same category, within 7 days.
  const visible = all.filter((x) => x.status !== "Merged" && x.duplicate_status !== "merged");
  const groups = new Map<string, Row[]>();
  const floorGroups = new Map<string, Row[]>();
  for (const t of visible) {
    const key = hotspotKey(t);
    if (key) groups.set(key, [...(groups.get(key) ?? []), t]);
    const floorKey = floorHotspotKey(t);
    if (floorKey) floorGroups.set(floorKey, [...(floorGroups.get(floorKey) ?? []), t]);
  }
  const split = (ts: Row[], span: number) => {
    const start = now - span * DAY;
    const cur = ts.filter((t) => new Date(t.created_at).getTime() >= start);
    const prevCount = ts.filter((t) => {
      const c = new Date(t.created_at).getTime();
      return c < start && c >= start - span * DAY;
    }).length;
    return { cur, prevCount };
  };
  const placeRanked = [...groups.entries()]
    .map(([key, ts]) => ({ key, floorLevel: false, ...split(ts, days) }))
    .filter((h) => h.cur.length >= 2);
  const floorRanked = [...floorGroups.entries()]
    .map(([key, ts]) => ({ key, floorLevel: true, ...split(ts, ESCALATION_RULES.floorWindowDays) }))
    .filter((h) => new Set(h.cur.map((t) => normaliseRoom(t.room_no))).size >= ESCALATION_RULES.floorMinRooms);
  const ranked = [...floorRanked, ...placeRanked.sort((a, b) => b.cur.length - a.cur.length)].slice(0, 8);

  const { data: cached } = ranked.length
    ? await supabase.from("hotspot_insights").select("*").in("hotspot_key", ranked.map((h) => h.key))
    : { data: [] };
  const cache = new Map(((cached ?? []) as HotspotInsight[]).map((c) => [c.hotspot_key, c]));

  const hotspots: Hotspot[] = ranked.map(({ key, cur, prevCount, floorLevel }) => {
    const c = cache.get(key);
    return {
      key,
      label: hotspotLabel(key),
      module: cur[0].module,
      floorLevel,
      count: cur.length,
      prevCount,
      trend: cur.length > prevCount ? "up" : cur.length < prevCount ? "down" : "flat",
      tickets: [...cur]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(({ ticket_no, title, status, created_at }) => ({ ticket_no, title, status, created_at })),
      insight: c ? { recommendation: c.recommendation, generated_at: c.generated_at, model: c.model, stale: c.ticket_count !== cur.length } : null,
    };
  });

  const departments: DepartmentRow[] = [...new Set(all.map((t) => t.department))]
    .map((department) => {
      const w = real.filter((t) => t.department === department);
      return {
        department,
        total: w.length,
        open: open.filter((t) => t.department === department).length,
        avgResolutionHours: avg(w.filter((t) => t.resolved_at).map(hours)),
        slaBreaches: w.filter((t) => breached(t, now)).length,
        reassignments: w.reduce((sum, t) => sum + (t.reassign_count ?? 0), 0),
        avgRating: avg(w.filter((t) => t.rating != null).map((t) => t.rating!)),
      };
    })
    .filter((d) => d.total > 0 || d.open > 0)
    .sort((a, b) => b.open - a.open || b.total - a.total);

  return {
    days,
    stats: {
      total: inWindow.length,
      open: open.length,
      avgResolutionHours: avg(resolved.map(hours)),
      withinSlaPct: resolved.length
        ? Math.round((100 * resolved.filter((t) => !t.sla_due_at || t.resolved_at! <= t.sla_due_at).length) / resolved.length)
        : null,
      avgRating: avg(rated.map((t) => t.rating!)),
      ratedCount: rated.length,
    },
    byCategory: countBy(real, (t) => t.category),
    byBuilding: countBy(real, (t) => t.building),
    daily,
    statusBreakdown: TICKET_STATUSES.map((status) => ({ status, count: inWindow.filter((t) => t.status === status).length })).filter(
      (s) => s.count > 0,
    ),
    hotspots,
    departments,
  };
}

export interface SecurityCounts {
  total: number;
  open: number;
  confidential: number;
  byCategory: { name: string; count: number }[];
}

/** Safety & Security for the Dean: aggregated counts only (no tickets, places or hotspots). */
export async function getSecurityCounts(days: InsightWindow): Promise<SecurityCounts> {
  const supabase = await createClient();
  const since = new Date(Date.now() - days * DAY).toISOString();
  const { data, error } = await supabase
    .from("tickets")
    .select("category, status, is_confidential, created_at")
    .eq("module", "security")
    .gte("created_at", since)
    .limit(3000);
  if (error) console.error("[getSecurityCounts]", error.message);
  const rows = (data ?? []) as Pick<Ticket, "category" | "status" | "is_confidential">[];
  return {
    total: rows.length,
    open: rows.filter((t) => OPEN_STATUSES.includes(t.status)).length,
    confidential: rows.filter((t) => t.is_confidential).length,
    byCategory: countBy(rows, (t) => t.category),
  };
}
