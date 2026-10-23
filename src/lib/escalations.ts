import "server-only";
import { after } from "next/server";
import type { TicketModule } from "@/config/routing";
import { ESCALATION_RULES, OPEN_STATUSES } from "@/config/statuses";
import { escalationBrief, type EscalationContext } from "@/lib/ai/escalation";
import { hotspotKey, hotspotLabel, parseHotspotKey } from "@/lib/hotspots";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Escalation, EscalationReason, Ticket, TicketEvent } from "@/lib/types";
import { formatLocation } from "@/lib/format";

/**
 * CLAUDE.md §7 — escalation rules. Run after every ticket create/update and when the
 * Insights / Escalations pages load. Idempotent: one active (open or acknowledged)
 * escalation per ticket or hotspot; when more students are affected we only update
 * affected_count (and refresh the AI brief in the background).
 */

type Admin = ReturnType<typeof createAdminClient>;

export const ESCALATION_TARGET: Record<TicketModule, "dean" | "hod"> = { hostel: "dean", academic: "hod", security: "dean" };
export const TARGET_LABELS: Record<"dean" | "hod", string> = {
  dean: "Dean of Student Affairs",
  hod: "Head of Department",
};
const ACTIVE_ESCALATION = ["open", "acknowledged"];
const DAY = 86_400_000;

const TICKET_COLS =
  "id, ticket_no, module, category, building, floor, reporter_id, status, priority, sla_due_at, reopen_count, escalated, created_at";
type TicketRow = Pick<
  Ticket,
  | "id"
  | "ticket_no"
  | "module"
  | "category"
  | "building"
  | "floor"
  | "reporter_id"
  | "status"
  | "priority"
  | "sla_due_at"
  | "reopen_count"
  | "escalated"
  | "created_at"
>;

interface Candidate {
  module: TicketModule;
  reason: EscalationReason;
  ticketId: string | null;
  hotspotKey: string | null;
  tickets: TicketRow[];
}

export async function checkEscalations(context?: { ticketId?: string }): Promise<void> {
  void context; // Full scan is cheap at campus scale and keeps the rules in one place.
  try {
    await runCheck(createAdminClient());
  } catch (err) {
    console.error("[checkEscalations]", err instanceof Error ? err.message : err);
  }
}

async function runCheck(admin: Admin) {
  const now = Date.now();
  const since = new Date(now - ESCALATION_RULES.recurringWindowDays * DAY).toISOString();

  const [recentRes, slaRes, reopenRes, activeRes, resolvedRes] = await Promise.all([
    admin
      .from("tickets")
      .select(TICKET_COLS)
      .gte("created_at", since)
      .neq("status", "Merged")
      .neq("duplicate_status", "merged")
      .not("building", "is", null),
    admin
      .from("tickets")
      .select(TICKET_COLS)
      .in("priority", ESCALATION_RULES.slaPriorities)
      .in("status", OPEN_STATUSES)
      .lt("sla_due_at", new Date(now).toISOString()),
    admin
      .from("tickets")
      .select(TICKET_COLS)
      .gte("reopen_count", ESCALATION_RULES.reopenCount)
      .not("status", "in", "(Closed,Merged)"),
    admin
      .from("escalations")
      .select("id, ticket_id, hotspot_key, affected_count")
      .in("status", ACTIVE_ESCALATION),
    admin.from("escalations").select("hotspot_key, resolved_at").eq("status", "resolved").not("hotspot_key", "is", null),
  ]);
  for (const r of [recentRes, slaRes, reopenRes, activeRes, resolvedRes]) {
    if (r.error) throw new Error(r.error.message);
  }

  const candidates: Candidate[] = [];

  // recurring: same module + category + building + floor, ≥3 tickets in 30 days
  const groups = new Map<string, TicketRow[]>();
  for (const t of (recentRes.data ?? []) as TicketRow[]) {
    const key = hotspotKey(t);
    if (key) groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const lastResolved = new Map<string, string>();
  for (const e of resolvedRes.data ?? []) {
    if (e.hotspot_key && e.resolved_at && (lastResolved.get(e.hotspot_key) ?? "") < e.resolved_at) {
      lastResolved.set(e.hotspot_key, e.resolved_at);
    }
  }
  for (const [key, tickets] of groups) {
    if (tickets.length < ESCALATION_RULES.recurringMinTickets) continue;
    // A resolved hotspot only comes back when a new ticket arrives after it was resolved.
    const newest = tickets.reduce((a, t) => (t.created_at > a ? t.created_at : a), "");
    if ((lastResolved.get(key) ?? "") > newest) continue;
    candidates.push({ module: tickets[0].module, reason: "recurring", ticketId: null, hotspotKey: key, tickets });
  }

  // Ticket-level rules: one escalation per ticket, whichever rule fires first.
  const seenTickets = new Set<string>();
  const ticketRule = (rows: TicketRow[] | null, reason: EscalationReason) => {
    for (const t of rows ?? []) {
      if (seenTickets.has(t.id)) continue;
      seenTickets.add(t.id);
      candidates.push({ module: t.module, reason, ticketId: t.id, hotspotKey: null, tickets: [t] });
    }
  };
  ticketRule(slaRes.data as TicketRow[] | null, "sla_breach");
  ticketRule(reopenRes.data as TicketRow[] | null, "reopened");
  if (candidates.length === 0) return;

  const allIds = [...new Set(candidates.flatMap((c) => c.tickets.map((t) => t.id)))];
  const { data: followerRows } = await admin.from("ticket_followers").select("ticket_id, user_id").in("ticket_id", allIds);
  const followers = new Map<string, string[]>();
  for (const f of followerRows ?? []) followers.set(f.ticket_id, [...(followers.get(f.ticket_id) ?? []), f.user_id]);

  const active = (activeRes.data ?? []) as Pick<Escalation, "id" | "ticket_id" | "hotspot_key" | "affected_count">[];
  const needBrief: string[] = [];

  for (const c of candidates) {
    const affected = new Set(c.tickets.flatMap((t) => [t.reporter_id, ...(followers.get(t.id) ?? [])])).size;
    const existing = active.find((e) => (c.hotspotKey ? e.hotspot_key === c.hotspotKey : e.ticket_id === c.ticketId));

    if (existing) {
      if (existing.affected_count !== affected) {
        await admin.from("escalations").update({ affected_count: affected, updated_at: new Date().toISOString() }).eq("id", existing.id);
        needBrief.push(existing.id);
      }
      await markEscalated(admin, c.tickets, ESCALATION_TARGET[c.module]);
      continue;
    }

    const { data: created, error } = await admin
      .from("escalations")
      .insert({
        module: c.module,
        ticket_id: c.ticketId,
        hotspot_key: c.hotspotKey,
        reason: c.reason,
        target_role: ESCALATION_TARGET[c.module],
        affected_count: affected,
      })
      .select("id")
      .single();
    if (error) {
      // 23505: another request created it a moment ago (unique open index) — fine.
      if (error.code !== "23505") console.error("[checkEscalations] insert", error.message);
      continue;
    }
    await markEscalated(admin, c.tickets, ESCALATION_TARGET[c.module]);
    needBrief.push(created.id);
  }

  scheduleBriefs(needBrief);
}

/** escalated = true + a student-visible event, once per ticket. */
async function markEscalated(admin: Admin, tickets: Pick<TicketRow, "id" | "escalated">[], target: "dean" | "hod") {
  const fresh = tickets.filter((t) => !t.escalated);
  if (fresh.length === 0) return;
  const ids = fresh.map((t) => t.id);
  await admin.from("tickets").update({ escalated: true }).in("id", ids);
  await admin.from("ticket_events").insert(
    ids.map((ticket_id) => ({
      ticket_id,
      actor_id: null,
      actor_name: "CampusConnect",
      actor_role: null,
      type: "escalated",
      note: `Escalated to ${TARGET_LABELS[target]} for priority attention.`,
    })),
  );
  for (const t of fresh) t.escalated = true;
}

// ---------------------------------------------------------------------------
// Manual escalation (warden → Dean for hostel, HOD for academic)
// ---------------------------------------------------------------------------
export async function createManualEscalation(input: {
  ticket: Ticket;
  reason: string;
  actor: { id: string; name: string; role: "warden" | "hod" };
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { ticket } = input;
  const target = ESCALATION_TARGET[ticket.module];

  const { data: existing } = await admin
    .from("escalations")
    .select("id")
    .eq("ticket_id", ticket.id)
    .in("status", ACTIVE_ESCALATION)
    .limit(1);
  if (existing?.length) return { ok: false, error: `This ticket is already escalated to the ${TARGET_LABELS[target]}.` };

  const { count } = await admin.from("ticket_followers").select("user_id", { count: "exact", head: true }).eq("ticket_id", ticket.id);
  const { data, error } = await admin
    .from("escalations")
    .insert({
      module: ticket.module,
      ticket_id: ticket.id,
      reason: "manual",
      target_role: target,
      affected_count: 1 + (count ?? 0),
      // Kept as the brief until Gemini writes a better one; also fed to Gemini.
      brief: input.reason.slice(0, 600),
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "This ticket is already escalated." };
    console.error("[createManualEscalation]", error?.message);
    return { ok: false, error: "Could not escalate. Please try again." };
  }

  await admin.from("tickets").update({ escalated: true }).eq("id", ticket.id);
  await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    actor_id: input.actor.id,
    actor_name: input.actor.name,
    actor_role: input.actor.role,
    type: "escalated",
    note: `Escalated to ${TARGET_LABELS[target]} for priority attention: ${input.reason.slice(0, 500)}`,
  });
  scheduleBriefs([data.id]);
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Safety reports (ragging / harassment / threats) go straight to the Dean
// ---------------------------------------------------------------------------
export async function createSafetyEscalation(ticket: Pick<Ticket, "id" | "category" | "title">): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("escalations")
    .insert({
      module: "security",
      ticket_id: ticket.id,
      reason: "safety",
      target_role: "dean",
      affected_count: 1,
      // Placeholder until Gemini writes the brief.
      brief: `A student filed a confidential ${ticket.category.toLowerCase()} report: ${ticket.title}.`,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code !== "23505") console.error("[createSafetyEscalation]", error?.message);
    return;
  }
  await admin.from("tickets").update({ escalated: true }).eq("id", ticket.id);
  await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    actor_id: null,
    actor_name: "CampusConnect",
    actor_role: null,
    type: "escalated",
    note: `Escalated to the ${TARGET_LABELS.dean} immediately because this is a safety report.`,
  });
  scheduleBriefs([data.id]);
}

// ---------------------------------------------------------------------------
// Linked tickets + AI brief
// ---------------------------------------------------------------------------
/** Tickets an escalation covers: its ticket, or every ticket in the hotspot's 30-day window. */
export async function linkedTickets(
  admin: Admin,
  esc: Pick<Escalation, "ticket_id" | "hotspot_key" | "created_at">,
): Promise<Ticket[]> {
  if (esc.ticket_id) {
    const { data } = await admin.from("tickets").select("*").eq("id", esc.ticket_id);
    return (data ?? []) as Ticket[];
  }
  if (!esc.hotspot_key) return [];
  const { module, category, building, floor } = parseHotspotKey(esc.hotspot_key);
  const since = new Date(new Date(esc.created_at).getTime() - ESCALATION_RULES.recurringWindowDays * DAY).toISOString();
  let q = admin
    .from("tickets")
    .select("*")
    .eq("module", module)
    .eq("category", category)
    .eq("building", building)
    .neq("status", "Merged")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  q = floor ? q.eq("floor", floor) : q.is("floor", null);
  const { data } = await q;
  return (data ?? []) as Ticket[];
}

export function escalationWhere(esc: Pick<Escalation, "hotspot_key">, tickets: Ticket[]): string {
  if (esc.hotspot_key) return hotspotLabel(esc.hotspot_key);
  const t = tickets[0];
  return t ? `${t.category} · ${formatLocation(t)}` : "Unknown location";
}

/** Runs after the response is sent when possible, so ticket actions stay fast. */
export function scheduleBriefs(ids: string[]) {
  if (ids.length === 0) return;
  const job = async () => {
    for (const id of ids) await generateEscalationBrief(id);
  };
  try {
    after(job);
  } catch {
    void job();
  }
}

/** (Re)writes the AI brief for one escalation. Falls back to a template if Gemini fails. */
export async function generateEscalationBrief(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data } = await admin.from("escalations").select("*").eq("id", id).maybeSingle();
  const esc = data as Escalation | null;
  if (!esc) return { ok: false, error: "Escalation not found." };

  const tickets = await linkedTickets(admin, esc);
  if (tickets.length === 0) return { ok: false, error: "No linked tickets." };
  const { data: eventRows } = await admin
    .from("ticket_events")
    .select("ticket_id, type, to_status, note, actor_name, created_at")
    .in("ticket_id", tickets.map((t) => t.id))
    .in("type", ["status_change", "note", "assigned", "reopened"])
    .order("created_at", { ascending: true });
  const events = (eventRows ?? []) as Pick<TicketEvent, "ticket_id" | "type" | "to_status" | "note" | "actor_name">[];

  const ctx: EscalationContext = {
    module: esc.module,
    reason: esc.reason,
    targetLabel: TARGET_LABELS[esc.target_role],
    where: escalationWhere(esc, tickets),
    category: tickets[0].category,
    affectedCount: esc.affected_count,
    manualNote: esc.reason === "manual" ? esc.brief : null,
    tickets: tickets.map((t) => ({
      ticket_no: t.ticket_no,
      title: t.title,
      summary: t.summary,
      status: t.status,
      priority: t.priority,
      created_at: t.created_at,
      sla_due_at: t.sla_due_at,
      reopen_count: t.reopen_count,
      history: events
        .filter((e) => e.ticket_id === t.id)
        .map((e) => [e.type === "status_change" ? `→ ${e.to_status}` : e.type, e.note].filter(Boolean).join(": ")),
    })),
  };

  const res = await escalationBrief(ctx);
  const brief = res.ok ? res.data : res.fallback;
  if (!brief) return { ok: false, error: res.ok ? undefined : res.error };
  await admin
    .from("escalations")
    .update({
      ...brief,
      brief_model: res.ok ? res.model : "template",
      brief_count: esc.affected_count,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return res.ok ? { ok: true } : { ok: false, error: "Gemini was unavailable — saved a basic brief instead." };
}
