import type { Role } from "./roles";

/** Mess menu (Hostel module). Single source of truth for meals, timings, the seeded menu and who may edit. */

export const MESS_TZ = "Asia/Kolkata";
export const MESS_UTC_OFFSET = "+05:30";

export const MESS_KEYS = ["all", "girls", "old_hostel", "new_hostel"] as const;
export type MessKey = (typeof MESS_KEYS)[number];
export const MESS_LABELS: Record<MessKey, string> = {
  all: "All messes",
  girls: "Girls Mess",
  old_hostel: "Old Hostel Mess",
  new_hostel: "New Hostel Mess",
};
/** Building name (config/locations) of each mess, used to pre-fill the complaint form. */
export const MESS_BUILDING: Record<Exclude<MessKey, "all">, string> = {
  girls: "Girls Mess",
  old_hostel: "Old Hostel Mess",
  new_hostel: "New Hostel Mess",
};

export const MEALS = ["breakfast", "lunch", "snacks", "dinner"] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABELS: Record<Meal, string> = { breakfast: "Breakfast", lunch: "Lunch", snacks: "Snacks", dinner: "Dinner" };

/** Monday = 0 … Sunday = 6. */
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type DietType = "veg" | "nonveg" | "either";
export interface MenuItem {
  name: string;
  type: DietType;
  /** "X / Y — choose one": the other choice. */
  alt?: string;
  /** Diet of the alternative (default veg). */
  alt_type?: DietType;
}

export const MENU_SEMESTER = "2026-27 Odd";
export const MENU_TITLE = "University Hostel Mess — 2026-27 (Odd Sem)";
export const MENU_FOOTER_NOTE =
  "This menu is prepared in consultation with students and the mess committee and may change from time to time with approval.";

/** Default serving times, "HH:MM" 24h. Editable by the mess committee. */
export const DEFAULT_TIMINGS: Record<Meal, { start: string; end: string }> = {
  breakfast: { start: "07:30", end: "09:30" },
  lunch: { start: "12:30", end: "14:30" },
  snacks: { start: "17:00", end: "18:00" },
  dinner: { start: "20:00", end: "22:00" },
};

export const DAILY_EXTRAS = ["Pickles"];

/** Mess Committee (Mr. Sharma) and the Dean edit the menu; the warden can look at ratings. */
export function isMessManager(role: Role, department: string | null | undefined): boolean {
  return role === "dean" || (role === "staff" && department === "Mess Committee");
}
export function canViewMessRatings(role: Role, department: string | null | undefined): boolean {
  return isMessManager(role, department) || role === "warden";
}

/** Which mess a student eats at, from their hostel + wing. */
export function messForStudent(hostel: string | null | undefined, wing: string | null | undefined): Exclude<MessKey, "all"> | null {
  if (hostel === "New Hostel") return "new_hostel";
  if (hostel === "Old Hostel") return /girl/i.test(wing ?? "") ? "girls" : "old_hostel";
  return null;
}

const v = (name: string): MenuItem => ({ name, type: "veg" });
const nv = (name: string): MenuItem => ({ name, type: "nonveg" });
/** "A / B" choose-one pair. */
const pick = (name: string, alt: string, type: DietType = "veg", altType: DietType = "veg"): MenuItem => ({ name, type, alt, alt_type: altType });

const SALAD_RICE_ROTI = [v("Rice"), v("Chapati"), v("Salad")];

/** The printed 2026-27 (Odd Sem) chart, exactly. Index = day (0 = Monday). */
export const DEFAULT_MENU: Record<Meal, MenuItem[]>[] = [
  // Monday
  {
    breakfast: [pick("Tea", "Milk"), v("Veg sandwich (each)"), nv("Bread omelette")],
    lunch: [v("Mix-veg"), v("Chana dal"), v("Mix raita"), ...SALAD_RICE_ROTI],
    snacks: [v("Bread pakora"), v("Tea")],
    dinner: [v("Dum aloo"), v("Masoor dal"), ...SALAD_RICE_ROTI, v("Milk")],
  },
  // Tuesday
  {
    breakfast: [v("Plain idli / Sambhar"), pick("Tea", "Milk")],
    lunch: [v("Aloo jeera"), v("Chole"), v("Boondi raita"), ...SALAD_RICE_ROTI],
    snacks: [v("Vada pav"), v("Tea")],
    dinner: [v("Petha"), v("Chana dal"), ...SALAD_RICE_ROTI, v("Milk")],
  },
  // Wednesday
  {
    breakfast: [v("Mix paratha + Curd"), v("Tea")],
    lunch: [v("Patta gobhi"), v("Kadhi pakora"), ...SALAD_RICE_ROTI],
    snacks: [v("Pasta"), v("Tea")],
    dinner: [pick("Chicken", "Kadhai paneer", "nonveg", "veg"), v("Arhar dal"), ...SALAD_RICE_ROTI, v("Gulab jamun (2 pcs)")],
  },
  // Thursday
  {
    breakfast: [v("Chole kulcha"), pick("Tea", "Milk")],
    lunch: [v("Rajma"), v("Lauki"), v("Curd"), ...SALAD_RICE_ROTI],
    snacks: [v("Pav bhaji"), v("Tea")],
    dinner: [v("Kofta"), v("Chana dal"), ...SALAD_RICE_ROTI, v("Milk")],
  },
  // Friday
  {
    breakfast: [v("Aloo poori"), v("Tea"), v("Milk")],
    lunch: [v("Aloo soya matar"), v("Kala masoor dal"), v("Raita"), ...SALAD_RICE_ROTI],
    snacks: [v("Aloo tikki"), v("Tea")],
    dinner: [pick("Paneer sabzi", "Egg curry", "veg", "nonveg"), v("Mix dal"), ...SALAD_RICE_ROTI, v("Jalebi")],
  },
  // Saturday
  {
    breakfast: [v("Chole bhature"), pick("Tea", "Milk")],
    lunch: [v("Masala tinda"), v("Kala chana"), v("Mix raita"), ...SALAD_RICE_ROTI],
    snacks: [v("Aloo patty"), v("Rooh Afza")],
    dinner: [pick("Aloo matar", "Aloo chole"), v("Chana dal tadka"), ...SALAD_RICE_ROTI, v("Milk")],
  },
  // Sunday
  {
    breakfast: [v("Aloo pyaaz paratha + Curd"), v("Tea")],
    lunch: [pick("Kadhai paneer", "Chicken curry", "veg", "nonveg"), v("Lobiya dal"), ...SALAD_RICE_ROTI],
    snacks: [v("Samosa"), v("Tea"), v("Imli chutney")],
    dinner: [v("Veg biryani"), v("Raita"), v("Dal makhani"), v("Chapati"), v("Salad")],
  },
];

// ---------------------------------------------------------------------------
// Time helpers (campus time, pure, safe on server and client)
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");

export interface CampusNow {
  /** "2026-10-24" */
  date: string;
  /** 0 = Monday … 6 = Sunday */
  day: number;
  minutes: number;
}

export function campusNow(d: Date = new Date()): CampusNow {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MESS_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  return { date: `${get("year")}-${get("month")}-${get("day")}`, day: Math.max(wd, 0), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** "14:30" -> "2:30 PM" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${pad(m || 0)} ${h >= 12 ? "PM" : "AM"}`;
}

export type Timings = Record<Meal, { start: string; end: string }>;

export interface MealStatus {
  /** The meal being served now, or the next one today (null after dinner). */
  meal: Meal | null;
  state: "now" | "upcoming" | "done";
  /** Meal after `meal` (tomorrow's breakfast when `meal` is dinner). */
  next: { meal: Meal; dayOffset: 0 | 1 } | null;
}

/** Current meal (serving now) or the next one, and the meal after it. */
export function mealStatus(now: CampusNow, t: Timings): MealStatus {
  for (let i = 0; i < MEALS.length; i++) {
    const m = MEALS[i];
    if (now.minutes < toMinutes(t[m].end)) {
      const state = now.minutes >= toMinutes(t[m].start) ? "now" : "upcoming";
      const after = MEALS[i + 1];
      return { meal: m, state, next: after ? { meal: after, dayOffset: 0 } : { meal: "breakfast", dayOffset: 1 } };
    }
  }
  return { meal: null, state: "done", next: { meal: "breakfast", dayOffset: 1 } };
}

/** A meal can be rated once it has started today. */
export function mealStarted(now: CampusNow, t: Timings, meal: Meal): boolean {
  return now.minutes >= toMinutes(t[meal].start);
}
