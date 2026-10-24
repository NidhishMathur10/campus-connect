"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { campusNow, DAY_NAMES, isMessManager, mealStarted, MEALS, MENU_SEMESTER, messForStudent } from "@/config/mess";
import { moderateMealComment } from "@/lib/ai/mess";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/tickets/actions";
import type { Profile } from "@/lib/types";
import { dishTranslations, loadMenu } from "./core";

/** Mess menu writes. Same pattern as sports / Lost & Found: check the profile here, write with the service role. */

function refresh() {
  revalidatePath("/hostel/mess");
  revalidatePath("/mess-menu");
  revalidatePath("/");
}

async function requireManager(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && isMessManager(profile.role, profile.department) ? profile : null;
}

// ---------------------------------------------------------------------------
// Student: rate a meal
// ---------------------------------------------------------------------------
const RateSchema = z.object({
  meal: z.enum(MEALS),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export async function rateMeal(input: z.input<typeof RateSchema>): Promise<ActionResult<{ unchecked: boolean }>> {
  const { profile } = await getCurrentProfile();
  if (!profile || profile.role !== "student") return { ok: false, error: "Only students can rate meals. Please log in again." };
  const parsed = RateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose 1 to 5 stars." };
  const { meal, rating } = parsed.data;
  const comment = parsed.data.comment || null;

  const mess = messForStudent(profile.hostel, profile.wing) ?? "all";
  const menu = await loadMenu(mess);
  const now = campusNow();
  if (!mealStarted(now, menu.timings, meal)) return { ok: false, error: "You can rate a meal once it has started." };

  let unchecked = false;
  if (comment) {
    const mod = await moderateMealComment(comment);
    if (!mod.allowed) return { ok: false, error: mod.reason };
    unchecked = mod.unchecked;
  }

  const { error } = await createAdminClient()
    .from("meal_ratings")
    .upsert(
      { user_id: profile.id, mess, date: now.date, meal, rating, comment, moderation: unchecked ? "unchecked" : "passed" },
      { onConflict: "user_id,date,meal" },
    );
  if (error) {
    console.error("[mess] rate", error.message);
    return { ok: false, error: "Could not save your rating. Please try again." };
  }
  refresh();
  return { ok: true, unchecked };
}

// ---------------------------------------------------------------------------
// Mess committee: edit the shared menu, timings, extras
// ---------------------------------------------------------------------------
const ItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["veg", "nonveg", "either"]),
  alt: z.string().trim().max(80).optional(),
  alt_type: z.enum(["veg", "nonveg", "either"]).optional(),
});
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const ItemsSchema = z.array(ItemSchema).max(20);
const SlotSchema = z.object({ start: TimeSchema, end: TimeSchema });
const SaveMenuSchema = z.object({
  grid: z.array(z.object({ breakfast: ItemsSchema, lunch: ItemsSchema, snacks: ItemsSchema, dinner: ItemsSchema })).length(7),
  extras: z.array(z.string().trim().min(1).max(40)).max(10),
  footer: z.string().trim().max(500),
  timings: z.object({ breakfast: SlotSchema, lunch: SlotSchema, snacks: SlotSchema, dinner: SlotSchema }),
});
export type SaveMenuInput = z.input<typeof SaveMenuSchema>;

/** Replaces the shared ('all') menu, extras, timings and footer in one go. */
export async function saveMenu(input: SaveMenuInput): Promise<ActionResult> {
  const profile = await requireManager();
  if (!profile) return { ok: false, error: "Only the Mess Committee can edit the menu." };
  const parsed = SaveMenuSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Some entries are not valid. Check the dish names and times." };
  const { grid, extras, footer, timings } = parsed.data;
  for (const m of MEALS) {
    if (timings[m].start >= timings[m].end) return { ok: false, error: `${m[0].toUpperCase()}${m.slice(1)}: the end time must be after the start time.` };
  }

  const db = createAdminClient();
  const now = new Date().toISOString();
  const clean = (items: z.infer<typeof ItemSchema>[]) =>
    items.map((i) => (i.alt ? i : { name: i.name, type: i.type }));
  const rows = DAY_NAMES.flatMap((_, day) =>
    MEALS.map((meal) => ({ mess: "all", semester: MENU_SEMESTER, day, meal, items: clean(grid[day][meal]), updated_at: now })),
  );
  const title = (await loadMenu("all")).title;
  const results = await Promise.all([
    db.from("mess_menus").upsert(rows, { onConflict: "mess,semester,day,meal" }),
    db.from("mess_timings").upsert(MEALS.map((meal) => ({ mess: "all", meal, start_time: timings[meal].start, end_time: timings[meal].end })), { onConflict: "mess,meal" }),
    db.from("mess_menu_meta").upsert({ mess: "all", semester: MENU_SEMESTER, title, footer_note: footer || null, updated_at: now }),
    db.from("daily_extras").delete().eq("mess", "all"),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("[mess] save", failed.error.message);
    return { ok: false, error: "Could not save the menu. Please try again." };
  }
  if (extras.length) {
    const { error } = await db.from("daily_extras").insert(extras.map((name, i) => ({ mess: "all", name, sort_order: i })));
    if (error) return { ok: false, error: "Could not save the daily extras." };
  }
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Hindi dish names for the student UI (any signed-in user)
// ---------------------------------------------------------------------------
export async function getDishHindi(names: string[]): Promise<Record<string, string>> {
  const { profile } = await getCurrentProfile();
  if (!profile || !Array.isArray(names)) return {};
  try {
    return await dishTranslations(names.filter((n) => typeof n === "string").slice(0, 200));
  } catch {
    return {};
  }
}
