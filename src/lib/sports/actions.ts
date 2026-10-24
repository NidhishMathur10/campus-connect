"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  canIssueEquipment,
  isSportsManager,
  normalizePickupCode,
  LOAN_ACTIVE_STATUSES,
  SPORTS_CATEGORIES,
  SPORTS_MAX_ITEMS_PER_STUDENT,
  SPORTS_SLOT_HOURS,
} from "@/config/sports";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/tickets/actions";
import type { Profile } from "@/lib/types";
import {
  createDamageTicket,
  generatePickupCode,
  logLoan,
  lookupByCode,
  type PickupLookup,
  MY_EQUIPMENT_PATH,
  reservationBlockUntil,
  runSportsWatcher,
  tellStudent,
} from "./core";
import { formatDateTime } from "@/lib/format";
import { formatClock, validSlot } from "./time";
import type { EquipmentLoan } from "./types";

/**
 * Sports equipment writes. Same pattern as Lost & Found: the signed-in profile is checked here, writes use
 * the service role, RLS in schema.sql is the safety net for direct API use.
 */

function refresh() {
  revalidatePath(MY_EQUIPMENT_PATH);
  revalidatePath("/sports");
}

async function requireStudent(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile?.role === "student" ? profile : null;
}

async function requireManager(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && isSportsManager(profile.role) ? profile : null;
}

/** Scanning, issuing and taking back: the Sports In-charge (and the Dean as backup). Inventory stays manager-only. */
async function requireIssuer(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && canIssueEquipment(profile.role) ? profile : null;
}

async function loadLoan(id: string): Promise<(EquipmentLoan & { item: { name: string } | null }) | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient().from("equipment_loans").select("*, item:equipment_items(name)").eq("id", id).maybeSingle();
  return (data as (EquipmentLoan & { item: { name: string } | null }) | null) ?? null;
}

// ---------------------------------------------------------------------------
// Student: reserve / cancel
// ---------------------------------------------------------------------------
const ReserveSchema = z.object({
  itemId: z.uuid(),
  qty: z.number().int().min(1).max(SPORTS_MAX_ITEMS_PER_STUDENT),
  day: z.enum(["today", "tomorrow"]),
  startHour: z.number().int().min(0).max(23),
  hours: z.number().int().refine((h) => (SPORTS_SLOT_HOURS as readonly number[]).includes(h)),
});

export async function reserveEquipment(
  input: z.input<typeof ReserveSchema>,
): Promise<ActionResult<{ loanId: string; code: string }>> {
  const profile = await requireStudent();
  if (!profile) return { ok: false, error: "Only students can reserve equipment. Please log in again." };
  const parsed = ReserveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please pick an item, quantity and time slot." };
  const { itemId, qty, day, startHour, hours } = parsed.data;

  const slot = validSlot(day, startHour, hours);
  if (!slot) return { ok: false, error: "That time slot isn't available any more. Please pick another." };

  await runSportsWatcher({ force: true });
  const blockedUntil = await reservationBlockUntil(profile.id);
  if (blockedUntil) {
    return {
      ok: false,
      error: `You returned equipment late twice recently, so reservations are paused until ${formatDateTime(blockedUntil)}. You can reserve again after that.`,
    };
  }

  const admin = createAdminClient();
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = generatePickupCode();
    const { data, error } = await admin.rpc("reserve_equipment", {
      p_item: itemId,
      p_student: profile.id,
      p_qty: qty,
      p_start: slot.start.toISOString(),
      p_end: slot.end.toISOString(),
      p_code: code,
      p_max: SPORTS_MAX_ITEMS_PER_STUDENT,
    });
    if (!error && data) {
      refresh();
      return { ok: true, loanId: data as string, code };
    }
    const msg = error?.message ?? "";
    if (msg.includes("equipment_loans_code_idx") || error?.code === "23505") continue; // code collision: try another
    if (msg.includes("not_enough")) return { ok: false, error: "Someone just took the last one. Please check the updated availability." };
    if (msg.includes("limit")) {
      return { ok: false, error: `You can hold at most ${SPORTS_MAX_ITEMS_PER_STUDENT} items at a time. Return something first or cancel a reservation.` };
    }
    if (msg.includes("under_repair")) return { ok: false, error: "This item is under repair right now." };
    if (msg.includes("unavailable")) return { ok: false, error: "This item isn't available." };
    console.error("[reserveEquipment]", msg);
    break;
  }
  return { ok: false, error: "Could not reserve right now. Please try again." };
}

export async function cancelReservation(loanId: string): Promise<ActionResult> {
  const profile = await requireStudent();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(loanId).success) return { ok: false, error: "Reservation not found." };
  const { data } = await createAdminClient()
    .from("equipment_loans")
    .update({ status: "expired", notes: "Cancelled by student" })
    .eq("id", loanId)
    .eq("student_id", profile.id)
    .eq("status", "reserved")
    .select("id");
  if (!data?.length) return { ok: false, error: "This reservation can't be cancelled any more." };
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sports In-charge: issue / return / damage ticket
// ---------------------------------------------------------------------------
/**
 * Scan / typed code → verification card. The QR carries only the pickup code; everything else is read from the
 * database here, so an edited or invented code just comes back "not found".
 */
export async function lookupPickupCode(raw: string): Promise<ActionResult<{ result: PickupLookup }>> {
  const profile = await requireIssuer();
  if (!profile) return { ok: false, error: "Only the Sports In-charge can look up pickup codes." };
  const code = normalizePickupCode(typeof raw === "string" ? raw.slice(0, 64) : "");
  if (!code) {
    await logLoan(null, profile, "lookup_failed", "Not a valid pickup code format");
    return { ok: false, error: "That doesn't look like a pickup code. It has 6 letters or numbers, like K7M2QX." };
  }
  await runSportsWatcher({ force: true });
  const result = await lookupByCode(code);
  if (!result) {
    await logLoan(null, profile, "lookup_failed", `Unknown code ${code}`);
    return { ok: false, error: "No reservation found for this code. Ask the student to show their code again." };
  }
  await logLoan(result.loan.id, profile, "scan", `Code ${code} · status ${result.loan.status}`);
  return { ok: true, result };
}

export async function issueLoan(loanId: string): Promise<ActionResult> {
  const profile = await requireIssuer();
  if (!profile) return { ok: false, error: "Only the Sports In-charge can issue equipment." };
  const loan = await loadLoan(loanId);
  if (!loan) return { ok: false, error: "Reservation not found." };
  if (loan.status !== "reserved") return { ok: false, error: `This reservation is already ${loan.status}.` };

  const now = new Date();
  // Picked up after the slot ended: give a fresh hour so it isn't overdue the moment it is handed over.
  const dueAt = new Date(loan.due_at).getTime() > now.getTime() + 15 * 60_000 ? loan.due_at : new Date(now.getTime() + 3_600_000).toISOString();
  const { data } = await createAdminClient()
    .from("equipment_loans")
    .update({ status: "issued", issued_at: now.toISOString(), due_at: dueAt })
    .eq("id", loanId)
    .eq("status", "reserved")
    .select("id");
  if (!data?.length) return { ok: false, error: "This reservation was just changed. Please refresh." };

  await logLoan(loan.id, profile, "issue", `${loan.qty}× ${loan.item?.name ?? "equipment"}`);
  await tellStudent(
    loan.student_id,
    "Issued ✓",
    `${loan.qty}× ${loan.item?.name ?? "equipment"} — please return it by ${formatClock(dueAt)}.`,
    MY_EQUIPMENT_PATH,
    "sports_issued",
  );
  refresh();
  return { ok: true };
}

const ReturnSchema = z.object({
  loanId: z.uuid(),
  qty: z.number().int().min(1),
  condition: z.enum(["good", "damaged"]),
  notes: z.string().trim().max(500).optional(),
  raiseTicket: z.boolean().optional(),
});

/** Takes back `qty` of a loan (all of it, or part: the returned part becomes its own "returned" row). */
export async function returnLoan(
  input: z.input<typeof ReturnSchema>,
): Promise<ActionResult<{ ticketNo?: string }>> {
  const profile = await requireIssuer();
  if (!profile) return { ok: false, error: "Only the Sports In-charge can take equipment back." };
  const parsed = ReturnSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please choose how many and the condition." };
  const { loanId, qty, condition, notes, raiseTicket } = parsed.data;

  const loan = await loadLoan(loanId);
  if (!loan) return { ok: false, error: "Loan not found." };
  if (loan.status !== "issued" && loan.status !== "overdue" && loan.status !== "return_pending") return { ok: false, error: "This item isn't currently issued." };
  const wasPending = loan.status === "return_pending";
  if (qty > loan.qty) return { ok: false, error: `Only ${loan.qty} issued on this loan.` };

  const admin = createAdminClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const wasLate = now.getTime() > new Date(loan.due_at).getTime();
  const lateFlag = loan.overdue_notified_at ?? (wasLate ? nowIso : null);
  const itemName = loan.item?.name ?? "equipment";
  const noteText = notes?.trim() || null;

  let returnedId = loan.id;
  if (qty === loan.qty) {
    const { data } = await admin
      .from("equipment_loans")
      .update({ status: "returned", returned_at: nowIso, return_condition: condition, notes: noteText ?? loan.notes, overdue_notified_at: lateFlag })
      .eq("id", loan.id)
      .in("status", ["issued", "overdue", "return_pending"])
      .select("id");
    if (!data?.length) return { ok: false, error: "This loan was just changed. Please refresh." };
  } else {
    // Partial return: the original keeps the rest; the returned part is a separate finished row.
    const { data: left } = await admin
      .from("equipment_loans")
      .update({ qty: loan.qty - qty, overdue_notified_at: lateFlag })
      .eq("id", loan.id)
      .eq("qty", loan.qty)
      .in("status", ["issued", "overdue", "return_pending"])
      .select("id");
    if (!left?.length) return { ok: false, error: "This loan was just changed. Please refresh." };
    const { data: part, error } = await admin
      .from("equipment_loans")
      .insert({
        item_id: loan.item_id,
        student_id: loan.student_id,
        qty,
        status: "returned",
        pickup_code: null,
        reserved_for: loan.reserved_for,
        due_at: loan.due_at,
        issued_at: loan.issued_at,
        returned_at: nowIso,
        return_condition: condition,
        notes: noteText,
      })
      .select("id")
      .single();
    if (error || !part) {
      await admin.from("equipment_loans").update({ qty: loan.qty }).eq("id", loan.id); // undo
      console.error("[returnLoan]", error?.message);
      return { ok: false, error: "Could not record the return. Please try again." };
    }
    returnedId = part.id;
  }

  let ticketNo: string | undefined;
  if (condition === "damaged" && raiseTicket) {
    const t = await createDamageTicket({ id: returnedId, qty, notes: noteText }, itemName, profile);
    if (t) {
      await admin.from("equipment_loans").update({ ticket_id: t.id }).eq("id", returnedId);
      ticketNo = t.ticket_no;
    }
  }

  await logLoan(returnedId, profile, "return", `${qty}× ${itemName}, ${condition}${ticketNo ? `, ticket ${ticketNo}` : ""}`);
  await tellStudent(
    loan.student_id,
    wasPending ? "Return confirmed ✓" : "Equipment returned",
    `Thanks — ${qty}× ${itemName} was ${condition === "damaged" ? "returned (marked damaged)" : "returned in good condition"}.`,
    MY_EQUIPMENT_PATH,
    "sports_returned",
  );
  refresh();
  return { ok: true, ticketNo };
}

/** Student says they handed the item back: waits for the Sports In-charge to confirm. Stops overdue reminders. */
export async function requestReturn(loanId: string): Promise<ActionResult> {
  const profile = await requireStudent();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(loanId).success) return { ok: false, error: "Loan not found." };
  const { data } = await createAdminClient()
    .from("equipment_loans")
    .update({ status: "return_pending", return_requested_at: new Date().toISOString() })
    .eq("id", loanId)
    .eq("student_id", profile.id)
    .in("status", ["issued", "overdue"])
    .select("id");
  if (!data?.length) return { ok: false, error: "This item can't be marked as returned any more. Please refresh." };
  refresh();
  return { ok: true };
}

/** Sports In-charge: the item never arrived. Back to Issued (the watcher flags it overdue again if it is late). */
export async function rejectReturnRequest(loanId: string): Promise<ActionResult> {
  const profile = await requireIssuer();
  if (!profile) return { ok: false, error: "Only the Sports In-charge can do this." };
  const loan = await loadLoan(loanId);
  if (!loan) return { ok: false, error: "Loan not found." };
  const { data } = await createAdminClient()
    .from("equipment_loans")
    .update({ status: "issued", return_requested_at: null })
    .eq("id", loanId)
    .eq("status", "return_pending")
    .select("id");
  if (!data?.length) return { ok: false, error: "This return was just changed. Please refresh." };
  await logLoan(loan.id, profile, "return_rejected", "Item not received at the counter");
  await tellStudent(
    loan.student_id,
    "Return not received",
    `The Sports in-charge didn't receive ${loan.qty}× ${loan.item?.name ?? "equipment"}. Please bring it to the Sports Complex counter.`,
    MY_EQUIPMENT_PATH,
    "sports_return_rejected",
  );
  refresh();
  return { ok: true };
}

/** One tap on an already-returned damaged loan: files the Sports ticket. */
export async function raiseDamageTicket(loanId: string): Promise<ActionResult<{ ticketNo: string }>> {
  const profile = await requireManager();
  if (!profile) return { ok: false, error: "Only the Sports In-charge can do this." };
  const loan = await loadLoan(loanId);
  if (!loan || loan.status !== "returned" || loan.return_condition !== "damaged") return { ok: false, error: "This isn't a damaged return." };
  if (loan.ticket_id) return { ok: false, error: "A ticket was already created for this return." };
  const admin = createAdminClient();
  const t = await createDamageTicket(loan, loan.item?.name ?? "equipment", profile);
  if (!t) return { ok: false, error: "Could not create the ticket. Please try again." };
  await admin.from("equipment_loans").update({ ticket_id: t.id }).eq("id", loan.id);
  refresh();
  return { ok: true, ticketNo: t.ticket_no };
}

// ---------------------------------------------------------------------------
// Sports In-charge: inventory
// ---------------------------------------------------------------------------
const ItemSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(80),
  category: z.enum(SPORTS_CATEGORIES),
  total_qty: z.number().int().min(0).max(500),
  condition_notes: z.string().trim().max(300).nullable().optional(),
});

export async function saveEquipmentItem(input: z.input<typeof ItemSchema>): Promise<ActionResult> {
  if (!(await requireManager())) return { ok: false, error: "Only the Sports In-charge can edit the inventory." };
  const parsed = ItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please enter a name, category and a quantity between 0 and 500." };
  const { id, ...fields } = parsed.data;
  const admin = createAdminClient();

  if (id) {
    // Never drop the total below what is currently out.
    const { data: out } = await admin.from("equipment_loans").select("qty").eq("item_id", id).in("status", LOAN_ACTIVE_STATUSES);
    const held = (out ?? []).reduce((n, l) => n + (l as { qty: number }).qty, 0);
    if (fields.total_qty < held) return { ok: false, error: `${held} are reserved or issued right now, so the total can't be below ${held}.` };
    const { error } = await admin.from("equipment_items").update({ ...fields, condition_notes: fields.condition_notes || null }).eq("id", id);
    if (error) return { ok: false, error: "Could not save the item." };
  } else {
    const { error } = await admin.from("equipment_items").insert({ ...fields, condition_notes: fields.condition_notes || null });
    if (error) return { ok: false, error: "Could not add the item." };
  }
  refresh();
  return { ok: true };
}

export async function setItemRepair(itemId: string, underRepair: boolean): Promise<ActionResult> {
  if (!(await requireManager())) return { ok: false, error: "Only the Sports In-charge can do this." };
  if (!z.uuid().safeParse(itemId).success) return { ok: false, error: "Item not found." };
  const { error } = await createAdminClient().from("equipment_items").update({ under_repair: underRepair }).eq("id", itemId);
  if (error) return { ok: false, error: "Could not update the item." };
  refresh();
  return { ok: true };
}

export async function setItemActive(itemId: string, active: boolean): Promise<ActionResult> {
  if (!(await requireManager())) return { ok: false, error: "Only the Sports In-charge can do this." };
  if (!z.uuid().safeParse(itemId).success) return { ok: false, error: "Item not found." };
  const { error } = await createAdminClient().from("equipment_items").update({ active }).eq("id", itemId);
  if (error) return { ok: false, error: "Could not update the item." };
  refresh();
  return { ok: true };
}
