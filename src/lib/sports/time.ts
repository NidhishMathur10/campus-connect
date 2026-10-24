import {
  SPORTS_CLOSE_HOUR,
  SPORTS_OPEN_HOUR,
  SPORTS_SLOT_HOURS,
  SPORTS_TZ,
  SPORTS_UTC_OFFSET,
} from "@/config/sports";

/** Slot maths for the equipment counter. Pure functions, safe on server and client. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar date ("2026-10-24") of an instant in campus time. */
export function campusDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SPORTS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The instant a campus-time date + whole hour starts. */
export function slotInstant(date: string, hour: number): Date {
  return new Date(`${date}T${pad(hour)}:00:00${SPORTS_UTC_OFFSET}`);
}

export const DAY_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
] as const;
export type SlotDay = (typeof DAY_OPTIONS)[number]["value"];

export function dateForDay(day: SlotDay, now: Date = new Date()): string {
  const today = campusDate(now);
  return day === "today" ? today : addDays(today, 1);
}

export interface SlotChoice {
  startHour: number;
  hours: number;
  start: Date;
  end: Date;
}

/** Slots that can still be booked on a day: whole-hour starts inside opening hours that haven't begun yet. */
export function slotsFor(day: SlotDay, hours: number, now: Date = new Date()): SlotChoice[] {
  const date = dateForDay(day, now);
  const out: SlotChoice[] = [];
  for (let h = SPORTS_OPEN_HOUR; h + hours <= SPORTS_CLOSE_HOUR; h++) {
    const start = slotInstant(date, h);
    if (start.getTime() <= now.getTime()) continue;
    out.push({ startHour: h, hours, start, end: slotInstant(date, h + hours) });
  }
  return out;
}

/** Is this exact (day, start hour, length) bookable right now? */
export function validSlot(day: SlotDay, startHour: number, hours: number, now: Date = new Date()): SlotChoice | null {
  if (!(SPORTS_SLOT_HOURS as readonly number[]).includes(hours)) return null;
  return slotsFor(day, hours, now).find((s) => s.startHour === startHour) ?? null;
}

const clock = (d: Date) =>
  d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: SPORTS_TZ }).replace(" ", " ");

/** "Today, 4:00 PM – 5:00 PM". */
export function formatSlot(startIso: string, endIso: string, now: Date = new Date()): string {
  const start = new Date(startIso);
  const d = campusDate(start);
  const today = campusDate(now);
  const day =
    d === today
      ? "Today"
      : d === addDays(today, 1)
        ? "Tomorrow"
        : start.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: SPORTS_TZ });
  return `${day}, ${clock(start)} – ${clock(new Date(endIso))}`;
}

export const formatClock = (iso: string) => clock(new Date(iso));

/** "in 25 min", "in 2h", "40 min ago". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const mins = Math.max(1, Math.round(Math.abs(diff) / 60_000));
  const text = mins < 60 ? `${mins} min` : mins < 48 * 60 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)} days`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
