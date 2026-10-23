import { NextResponse } from "next/server";
import { z } from "zod";
import { hotspotInsight } from "@/lib/ai/hotspot";
import { getCurrentProfile } from "@/lib/auth";
import { hotspotLabel, parseHotspotKey } from "@/lib/hotspots";
import { insightsModule } from "@/lib/insights";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({ key: z.string().min(5).max(200), days: z.union([z.literal(7), z.literal(30)]).default(30) });

/** POST /api/ai/hotspot-insight — one-line Gemini recommendation for a hotspot, cached in hotspot_insights. */
export async function POST(request: Request) {
  const { profile } = await getCurrentProfile();
  const scope = profile ? insightsModule(profile, undefined) : "forbidden";
  if (!profile || scope === "forbidden") return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Missing hotspot key." }, { status: 400 });
  const { key, days } = parsed.data;
  const { module, category, building, floor } = parseHotspotKey(key);
  if (module !== "hostel" && module !== "academic") return NextResponse.json({ ok: false, error: "Bad key." }, { status: 400 });
  if (scope && scope !== module) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });

  const admin = createAdminClient();
  const now = Date.now();
  let q = admin
    .from("tickets")
    .select("title, status, created_at")
    .eq("module", module)
    .eq("category", category)
    .eq("building", building)
    .neq("status", "Merged")
    .gte("created_at", new Date(now - 2 * days * 86_400_000).toISOString())
    .order("created_at", { ascending: false });
  q = floor ? q.eq("floor", floor) : q.is("floor", null);
  const { data } = await q;
  const rows = data ?? [];
  const cur = rows.filter((t) => new Date(t.created_at).getTime() >= now - days * 86_400_000);
  const prev = rows.length - cur.length;
  if (cur.length === 0) return NextResponse.json({ ok: false, error: "No recent tickets for this hotspot." });

  const res = await hotspotInsight({
    label: hotspotLabel(key),
    count: cur.length,
    days,
    trend: cur.length > prev ? "up" : cur.length < prev ? "down" : "flat",
    tickets: cur,
  });
  const recommendation = res.ok ? res.data.recommendation : res.fallback?.recommendation;
  if (!recommendation) return NextResponse.json({ ok: false, error: "AI unavailable." });

  // Only cache real Gemini answers, so a fallback is retried next time.
  if (res.ok) {
    await admin.from("hotspot_insights").upsert({
      hotspot_key: key,
      module,
      recommendation,
      ticket_count: cur.length,
      model: res.model,
      generated_at: new Date().toISOString(),
    });
  }
  return NextResponse.json({ ok: true, recommendation, ai: res.ok });
}
