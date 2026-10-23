import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { escalationModules } from "@/lib/escalation-queries";
import { generateEscalationBrief } from "@/lib/escalations";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({ escalationId: z.uuid(), force: z.boolean().optional() });

/** POST /api/ai/escalation-brief — (re)writes the Gemini brief for one escalation. */
export async function POST(request: Request) {
  const { profile } = await getCurrentProfile();
  if (!profile || escalationModules(profile).length === 0) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Missing escalationId." }, { status: 400 });

  // RLS check: the caller must be able to see this escalation.
  const supabase = await createClient();
  const { data } = await supabase.from("escalations").select("id, module, brief_model, brief_count, affected_count").eq("id", parsed.data.escalationId).maybeSingle();
  if (!data || !escalationModules(profile).includes(data.module)) {
    return NextResponse.json({ ok: false, error: "Unknown escalation." }, { status: 404 });
  }

  // Cached: a real Gemini brief is only rewritten when more students are affected, or on "Regenerate".
  if (!parsed.data.force && data.brief_model && data.brief_model !== "template" && data.brief_count === data.affected_count) {
    return NextResponse.json({ ok: true, cached: true });
  }

  try {
    const res = await generateEscalationBrief(data.id);
    return NextResponse.json(res);
  } catch (err) {
    console.error("[api/ai/escalation-brief]", err);
    return NextResponse.json({ ok: false, error: "Could not write the brief." });
  }
}
