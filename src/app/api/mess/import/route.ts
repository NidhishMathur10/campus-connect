import { NextResponse } from "next/server";
import { DAY_NAMES, isMessManager, MEALS, type MenuItem, type Meal } from "@/config/mess";
import { importMenuFromImage } from "@/lib/ai/mess";
import { getCurrentProfile } from "@/lib/auth";

export type ImportMenuResponse =
  | { ok: true; grid: Record<Meal, MenuItem[]>[]; extras: string[]; footer: string; cells: number }
  | { ok: false; error: string };

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * POST /api/mess/import — "Upload menu photo". Gemini reads the printed chart and returns the weekly menu
 * for the committee to review; nothing is saved until they press Save in the editor.
 */
export async function POST(request: Request) {
  const reply = (body: ImportMenuResponse, status = 200) => NextResponse.json(body, { status });
  const { profile } = await getCurrentProfile();
  if (!profile || !isMessManager(profile.role, profile.department)) return reply({ ok: false, error: "Only the Mess Committee can import a menu." }, 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof Blob) || file.size === 0) return reply({ ok: false, error: "Choose a photo of the menu first." }, 400);
  if (file.size > MAX_BYTES) return reply({ ok: false, error: "That photo is too large. Try a smaller one." }, 400);
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reply({ ok: false, error: "Please use a JPG, PNG or WebP photo." }, 400);

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const res = await importMenuFromImage(base64, file.type);
  if (!res.ok) {
    console.error("[api/mess/import]", res.error);
    return reply({ ok: false, error: "The AI couldn't read this photo right now. Try again, or edit the menu by hand." });
  }
  if (!res.data.is_menu || res.data.meals.length === 0) return reply({ ok: false, error: "This doesn't look like a mess menu. Try a clearer, straight-on photo of the chart." });

  const grid: Record<Meal, MenuItem[]>[] = DAY_NAMES.map(() => ({ breakfast: [], lunch: [], snacks: [], dinner: [] }));
  let cells = 0;
  for (const m of res.data.meals) {
    if (!MEALS.includes(m.meal)) continue;
    grid[m.day][m.meal] = m.items
      .filter((i) => i.name.trim())
      .map((i) => {
        const alt = i.alt.trim();
        return alt
          ? { name: i.name.trim(), type: i.type, alt, alt_type: i.alt_type }
          : { name: i.name.trim(), type: i.type };
      });
    cells++;
  }
  return reply({ ok: true, grid, extras: res.data.daily_extras.map((e) => e.trim()).filter(Boolean), footer: res.data.footer_note.trim(), cells });
}
