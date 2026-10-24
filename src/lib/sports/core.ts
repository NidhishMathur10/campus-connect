import "server-only";
import {
  LOAN_ACTIVE_STATUSES,
  PICKUP_CODE_ALPHABET,
  PICKUP_CODE_LENGTH,
  SPORTS_BLOCK_DAYS,
  SPORTS_OVERDUE_LIMIT,
  SPORTS_OVERDUE_WINDOW_DAYS,
  SPORTS_PICKUP_GRACE_MIN,
  SPORTS_REMINDER_MIN,
} from "@/config/sports";
import { computeSlaDueAt, getRoutingRule } from "@/config/routing";
import { autoAssignTicket } from "@/lib/assignment";
import { notifyTicketCreated } from "@/lib/email/notify";
import { checkEscalations } from "@/lib/escalations";
import { notify } from "@/lib/notifications";
import { deliverPush } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import { campusDate, formatClock } from "./time";
import type { EquipmentItem, EquipmentLoan, ItemWithAvailability, LoanView } from "./types";

/** Server-side building blocks for sports equipment: reads, the watcher, notifications and the damage ticket. */

export const MY_EQUIPMENT_PATH = "/hostel/sports";

export function generatePickupCode(): string {
  let code = "";
  for (let i = 0; i < PICKUP_CODE_LENGTH; i++) code += PICKUP_CODE_ALPHABET[Math.floor(Math.random() * PICKUP_CODE_ALPHABET.length)];
  return code;
}

// ---------------------------------------------------------------------------
// Reads (service role: students may not read other people's loans, but availability needs the totals)
// ---------------------------------------------------------------------------
export async function listItems(opts: { includeInactive?: boolean } = {}): Promise<ItemWithAvailability[]> {
  const admin = createAdminClient();
  let q = admin.from("equipment_items").select("*").order("category").order("name");
  if (!opts.includeInactive) q = q.eq("active", true);
  const [{ data: items }, { data: out }] = await Promise.all([
    q,
    admin.from("equipment_loans").select("item_id, qty").in("status", LOAN_ACTIVE_STATUSES),
  ]);
  const taken = new Map<string, number>();
  for (const l of (out ?? []) as { item_id: string; qty: number }[]) taken.set(l.item_id, (taken.get(l.item_id) ?? 0) + l.qty);
  return ((items ?? []) as EquipmentItem[]).map((i) => ({ ...i, available: Math.max(0, i.total_qty - (taken.get(i.id) ?? 0)) }));
}

const LOAN_SELECT =
  "*, item:equipment_items(name, category), student:profiles!equipment_loans_student_id_fkey(full_name, roll_no), ticket:tickets(ticket_no)";

type LoanRow = EquipmentLoan & {
  item: { name: string; category: string } | null;
  student: { full_name: string; roll_no: string | null } | null;
  ticket: { ticket_no: string } | null;
};

function toView(r: LoanRow, withStudent: boolean): LoanView {
  const { item, student, ticket, ...loan } = r;
  return {
    ...loan,
    item_name: item?.name ?? "Item",
    item_category: item?.category ?? "Other",
    ticket_no: ticket?.ticket_no ?? null,
    ...(withStudent ? { student_name: student?.full_name ?? "Student", student_roll: student?.roll_no ?? null } : {}),
  };
}

/** A student's loans, newest first (the page splits current holds from history). */
export async function listMyLoans(studentId: string): Promise<LoanView[]> {
  const { data } = await createAdminClient()
    .from("equipment_loans")
    .select(LOAN_SELECT)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(40);
  return ((data ?? []) as unknown as LoanRow[]).map((r) => toView(r, false));
}

export interface DeskData {
  items: ItemWithAvailability[];
  /** Reserved + issued + overdue, soonest first: the search box works on these. */
  active: LoanView[];
  /** Returned damaged but no Sports ticket yet. */
  damagedNoTicket: LoanView[];
  recentReturns: LoanView[];
  /** Reservations whose slot is today (campus time). */
  todayCount: number;
}

export async function loadDesk(): Promise<DeskData> {
  const admin = createAdminClient();
  const [items, activeRes, returnsRes, damagedRes] = await Promise.all([
    listItems({ includeInactive: true }),
    admin.from("equipment_loans").select(LOAN_SELECT).in("status", LOAN_ACTIVE_STATUSES).order("reserved_for"),
    admin.from("equipment_loans").select(LOAN_SELECT).eq("status", "returned").order("returned_at", { ascending: false }).limit(12),
    admin.from("equipment_loans").select(LOAN_SELECT).eq("status", "returned").eq("return_condition", "damaged").is("ticket_id", null),
  ]);
  const active = ((activeRes.data ?? []) as unknown as LoanRow[]).map((r) => toView(r, true));
  const today = campusDate();
  return {
    items,
    active,
    damagedNoTicket: ((damagedRes.data ?? []) as unknown as LoanRow[]).map((r) => toView(r, true)),
    recentReturns: ((returnsRes.data ?? []) as unknown as LoanRow[]).map((r) => toView(r, true)),
    todayCount: active.filter((l) => l.status === "reserved" && campusDate(new Date(l.reserved_for)) === today).length,
  };
}

/** If 2+ late returns in the last 30 days: the time the reservation block ends (ISO), else null. */
export async function reservationBlockUntil(studentId: string, now = new Date()): Promise<string | null> {
  const since = new Date(now.getTime() - SPORTS_OVERDUE_WINDOW_DAYS * 86_400_000).toISOString();
  const { data } = await createAdminClient()
    .from("equipment_loans")
    .select("overdue_notified_at")
    .eq("student_id", studentId)
    .not("overdue_notified_at", "is", null)
    .gte("overdue_notified_at", since)
    .order("overdue_notified_at", { ascending: false });
  const late = (data ?? []) as { overdue_notified_at: string }[];
  if (late.length < SPORTS_OVERDUE_LIMIT) return null;
  const until = new Date(late[0].overdue_notified_at).getTime() + SPORTS_BLOCK_DAYS * 86_400_000;
  return until > now.getTime() ? new Date(until).toISOString() : null;
}

// ---------------------------------------------------------------------------
// Notifications: in-app bell + push (students without a device are silently skipped)
// ---------------------------------------------------------------------------
export async function tellStudent(studentId: string, title: string, body: string, link: string, template: string): Promise<void> {
  try {
    await notify([{ user_id: studentId, kind: "sports", title, body, link }]);
    const { data } = await createAdminClient().from("profiles").select("id, full_name, role").eq("id", studentId).maybeSingle();
    if (data) await deliverPush(data, { title, body, tag: `sports-${template}`, url: link }, { template });
  } catch (err) {
    console.error("[sports notify]", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Watcher: expire no-shows, remind, flag overdue. Idempotent: each step claims its row with a guarded UPDATE.
// ---------------------------------------------------------------------------
const g = globalThis as unknown as { __sportsWatcher?: { last: number } };
const state = (g.__sportsWatcher ??= { last: 0 });

interface WatchedLoan {
  student_id: string;
  qty: number;
  due_at: string;
  item: { name: string } | null;
}
const WATCH_COLUMNS = "id, student_id, qty, due_at, item:equipment_items(name)";

export async function runSportsWatcher(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && Date.now() - state.last < 60_000) return;
  state.last = Date.now();
  try {
    const admin = createAdminClient();
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Reservations not picked up within 30 minutes of the slot start.
    const cutoff = new Date(now.getTime() - SPORTS_PICKUP_GRACE_MIN * 60_000).toISOString();
    const { data: expired } = await admin
      .from("equipment_loans")
      .update({ status: "expired" })
      .eq("status", "reserved")
      .lt("reserved_for", cutoff)
      .select(WATCH_COLUMNS);
    for (const l of (expired ?? []) as unknown as WatchedLoan[]) {
      await tellStudent(
        l.student_id,
        "Reservation expired",
        `${l.qty}× ${l.item?.name ?? "equipment"} wasn't picked up within ${SPORTS_PICKUP_GRACE_MIN} minutes, so it was released.`,
        MY_EQUIPMENT_PATH,
        "sports_expired",
      );
    }

    // 2. Issued items past their return time -> overdue (once).
    const { data: late } = await admin
      .from("equipment_loans")
      .update({ status: "overdue", overdue_notified_at: nowIso })
      .eq("status", "issued")
      .lt("due_at", nowIso)
      .select(WATCH_COLUMNS);
    for (const l of (late ?? []) as unknown as WatchedLoan[]) {
      await tellStudent(
        l.student_id,
        "Equipment overdue",
        `Please return ${l.qty}× ${l.item?.name ?? "equipment"} to the Sports Complex now.`,
        MY_EQUIPMENT_PATH,
        "sports_overdue",
      );
    }

    // 3. "Due in 30 minutes" reminder (once).
    const soon = new Date(now.getTime() + SPORTS_REMINDER_MIN * 60_000).toISOString();
    const { data: due } = await admin
      .from("equipment_loans")
      .update({ reminded_at: nowIso })
      .eq("status", "issued")
      .is("reminded_at", null)
      .gte("due_at", nowIso)
      .lte("due_at", soon)
      .select(WATCH_COLUMNS);
    for (const l of (due ?? []) as unknown as WatchedLoan[]) {
      await tellStudent(
        l.student_id,
        "Return due soon",
        `${l.qty}× ${l.item?.name ?? "equipment"} is due back at ${formatClock(l.due_at)}.`,
        MY_EQUIPMENT_PATH,
        "sports_reminder",
      );
    }
  } catch (err) {
    console.error("[sportsWatcher]", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Damaged return -> Sports ticket in the normal complaint system (routing as usual)
// ---------------------------------------------------------------------------
export async function createDamageTicket(
  loan: Pick<EquipmentLoan, "id" | "qty" | "notes">,
  itemName: string,
  actor: Pick<Profile, "id" | "full_name" | "role">,
): Promise<{ id: string; ticket_no: string } | null> {
  const admin = createAdminClient();
  const rule = getRoutingRule("hostel", "Sports");
  const department = rule.departments[0];
  const what = `${loan.qty}× ${itemName}`;
  const note = loan.notes?.trim();
  const { data: ticket, error } = await admin
    .from("tickets")
    .insert({
      module: "hostel",
      reporter_id: actor.id,
      original_text: `${what} was returned damaged to the Sports Complex.${note ? ` Sports In-charge note: ${note}` : ""}`,
      language: "en",
      english_text: null,
      title: `Damaged ${itemName} returned`,
      summary: `${what} came back damaged on return${note ? `: ${note}` : ""}. Please inspect, repair or replace it.`,
      category: "Sports",
      department,
      priority: rule.defaultPriority,
      ai_meta: { model: "manual", manual_entry: true, moderation: "passed", source: "equipment_return", loan_id: loan.id },
      building: "Sports Complex",
      spot: `Sports equipment: ${what}`,
      status: "Submitted",
      details_incomplete: false,
      sla_due_at: computeSlaDueAt("hostel", "Sports", rule.defaultPriority).toISOString(),
    })
    .select("id, ticket_no")
    .single();
  if (error || !ticket) {
    console.error("[damage ticket]", error?.message);
    return null;
  }
  await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    actor_id: actor.id,
    actor_name: actor.full_name,
    actor_role: actor.role,
    type: "created",
    to_status: "Submitted",
    note: "Raised from the Sports equipment desk: item returned damaged.",
  });
  await autoAssignTicket(ticket.id, "created");
  await checkEscalations({ ticketId: ticket.id });
  notifyTicketCreated(ticket.id);
  return ticket;
}
