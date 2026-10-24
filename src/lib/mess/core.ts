import "server-only";
import { DAY_NAMES, DEFAULT_MENU, DEFAULT_TIMINGS, DAILY_EXTRAS, MEALS, MENU_FOOTER_NOTE, MENU_SEMESTER, MENU_TITLE, MESS_TZ, type MenuItem, type Meal, type MessKey, type Timings } from "@/config/mess";
import { summariseMealComments, transliterateDishes } from "@/lib/ai/mess";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MenuData, MyRating, RatingsDashboard } from "./types";

/** Mess menu reads. Service-role client after the page has checked the role; RLS in schema.sql covers direct API use. */

const emptyGrid = (): Record<Meal, MenuItem[]>[] => DAY_NAMES.map(() => ({ breakfast: [], lunch: [], snacks: [], dinner: [] }));

/** The built-in menu, used when the tables are empty or not created yet so the UI never breaks. */
export function defaultMenuData(mess: MessKey): MenuData {
  return {
    mess,
    title: MENU_TITLE,
    semester: MENU_SEMESTER,
    footer: MENU_FOOTER_NOTE,
    grid: DEFAULT_MENU.map((d) => ({ ...d })),
    notes: {},
    extras: DAILY_EXTRAS.map((name) => ({ name, meals: [...MEALS] })),
    timings: { ...DEFAULT_TIMINGS },
  };
}

type MenuRow = { mess: string; day: number; meal: Meal; items: MenuItem[]; note: string | null };
const allFirst = (a: { mess: string }, b: { mess: string }) => (a.mess === "all" ? -1 : 0) - (b.mess === "all" ? -1 : 0);

/** Resolves the menu for one mess: its own rows win over the shared 'all' rows, per day + meal. */
export async function loadMenu(mess: MessKey): Promise<MenuData> {
  const db = createAdminClient();
  const keys = mess === "all" ? ["all"] : ["all", mess];
  const [menus, extras, timings, meta] = await Promise.all([
    db.from("mess_menus").select("mess, day, meal, items, note").eq("semester", MENU_SEMESTER).in("mess", keys),
    db.from("daily_extras").select("mess, name, meals, sort_order").in("mess", keys).order("sort_order"),
    db.from("mess_timings").select("mess, meal, start_time, end_time").in("mess", keys),
    db.from("mess_menu_meta").select("mess, semester, title, footer_note").in("mess", keys),
  ]);
  if (menus.error || !menus.data?.length) return defaultMenuData(mess);

  const base = defaultMenuData(mess);
  const grid = emptyGrid();
  const notes: Record<string, string> = {};
  for (const r of [...(menus.data as MenuRow[])].sort(allFirst)) {
    grid[r.day][r.meal] = r.items ?? [];
    if (r.note) notes[`${r.day}:${r.meal}`] = r.note;
  }

  const t: Timings = { ...base.timings };
  for (const r of [...(timings.data ?? [])].sort(allFirst)) t[r.meal as Meal] = { start: r.start_time, end: r.end_time };

  const ownExtras = (extras.data ?? []).filter((e) => e.mess === mess);
  const extraRows = ownExtras.length ? ownExtras : (extras.data ?? []);
  const m = (meta.data ?? []).find((x) => x.mess === mess) ?? (meta.data ?? []).find((x) => x.mess === "all");

  return {
    mess,
    title: m?.title ?? base.title,
    semester: m?.semester ?? base.semester,
    footer: m?.footer_note ?? base.footer,
    grid,
    notes,
    extras: extras.error ? base.extras : extraRows.map((e) => ({ name: e.name, meals: e.meals as Meal[] })),
    timings: t,
  };
}

export async function myRatingsFor(userId: string, date: string): Promise<MyRating[]> {
  const { data } = await createAdminClient().from("meal_ratings").select("meal, rating, comment").eq("user_id", userId).eq("date", date);
  return (data ?? []) as MyRating[];
}

// ---------------------------------------------------------------------------
// Hindi dish names (cached)
// ---------------------------------------------------------------------------
export async function dishTranslations(names: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 200);
  if (!unique.length) return {};
  const db = createAdminClient();
  const { data } = await db.from("mess_translations").select("name, hi").in("name", unique);
  const out: Record<string, string> = Object.fromEntries((data ?? []).map((r) => [r.name as string, r.hi as string]));
  const missing = unique.filter((n) => !out[n]);
  if (missing.length) {
    const res = await transliterateDishes(missing);
    if (res.ok) {
      const rows = res.data.items.filter((i) => missing.includes(i.name) && i.hi.trim()).map((i) => ({ name: i.name, hi: i.hi.trim() }));
      for (const r of rows) out[r.name] = r.hi;
      if (rows.length) await db.from("mess_translations").upsert(rows);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ratings dashboard (last 30 days)
// ---------------------------------------------------------------------------
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** 0 = Monday … 6 = Sunday for a "YYYY-MM-DD" date. */
function weekdayOf(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

const STAPLES = /^(tea|milk|rice|chapati|salad)$/i;

export async function loadRatingsDashboard(menu: MenuData): Promise<RatingsDashboard> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toLocaleDateString("en-CA", { timeZone: MESS_TZ });
  const { data } = await db.from("meal_ratings").select("date, meal, rating, comment").gte("date", since);
  const rows = (data ?? []) as { date: string; meal: Meal; rating: number; comment: string | null }[];

  const byMeal = MEALS.map((meal) => {
    const rs = rows.filter((r) => r.meal === meal).map((r) => r.rating);
    return { meal, avg: avg(rs), count: rs.length };
  });
  const byDay = DAY_NAMES.map((_, day) => {
    const of = rows.filter((r) => weekdayOf(r.date) === day);
    return {
      day,
      avg: avg(of.map((r) => r.rating)),
      count: of.length,
      meals: Object.fromEntries(MEALS.map((m) => [m, avg(of.filter((r) => r.meal === m).map((r) => r.rating))])) as Record<Meal, number | null>,
    };
  });

  // A dish inherits the rating of every meal it was served in.
  const dish = new Map<string, number[]>();
  for (const r of rows) {
    for (const it of menu.grid[weekdayOf(r.date)]?.[r.meal] ?? []) {
      for (const n of [it.name, it.alt].filter(Boolean) as string[]) {
        if (STAPLES.test(n.trim())) continue;
        dish.set(n, [...(dish.get(n) ?? []), r.rating]);
      }
    }
  }
  const lowestDishes = [...dish.entries()]
    .filter(([, rs]) => rs.length >= 2)
    .map(([name, rs]) => ({ name, avg: avg(rs) ?? 0, count: rs.length }))
    .sort((a, b) => a.avg - b.avg || b.count - a.count)
    .slice(0, 5);

  const withComments = rows.filter((r) => r.comment?.trim());
  let summary: RatingsDashboard["summary"] = null;
  if (withComments.length >= 3) {
    const { data: cached } = await db.from("mess_rating_summaries").select("response_count, summary").eq("id", "all").maybeSingle();
    if (cached && cached.response_count === withComments.length) {
      summary = cached.summary as RatingsDashboard["summary"];
    } else {
      const res = await summariseMealComments(
        withComments.slice(0, 80).map((r) => ({ day: DAY_NAMES[weekdayOf(r.date)], meal: r.meal, rating: r.rating, comment: r.comment!.slice(0, 300) })),
      );
      if (res.ok) {
        summary = res.data;
        await db.from("mess_rating_summaries").upsert({ id: "all", response_count: withComments.length, summary: res.data, updated_at: new Date().toISOString() });
      } else if (cached) {
        summary = cached.summary as RatingsDashboard["summary"];
      }
    }
  }

  return { total: rows.length, avg: avg(rows.map((r) => r.rating)), byMeal, byDay, lowestDishes, commentCount: withComments.length, summary };
}
