import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured, GEMINI_MODEL, GEMINI_MODEL_CHAIN } from "@/lib/ai/gemini";

const HealthSchema = z.object({
  ok: z.boolean().describe("Always true"),
  greeting: z.string().describe("A friendly greeting of at most 5 words"),
});

/**
 * GET /api/ai/health - shows the configured models without spending quota.
 * Add ?deep=1 to make one tiny Gemini call that proves the key + models work.
 */
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.get("deep") !== "1") {
    return NextResponse.json({
      ok: true,
      deep: false,
      keyConfigured: !!process.env.GEMINI_API_KEY,
      model: GEMINI_MODEL,
      models: GEMINI_MODEL_CHAIN,
      hint: "Add ?deep=1 to test a real Gemini call (uses a little quota).",
    });
  }

  const result = await generateStructured({
    schema: HealthSchema,
    prompt: "Health check. Reply with ok=true and a short friendly greeting for college students.",
    timeoutMs: 15_000,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, model: GEMINI_MODEL, error: result.error, ms: result.ms },
      { status: 503 },
    );
  }
  return NextResponse.json({
    ok: true,
    model: result.model,
    ms: result.ms,
    reply: result.data,
  });
}
