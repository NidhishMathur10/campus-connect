import { NextResponse } from "next/server";
import { z } from "zod";
import { generateStructured, GEMINI_MODEL } from "@/lib/ai/gemini";

const HealthSchema = z.object({
  ok: z.boolean().describe("Always true"),
  greeting: z.string().describe("A friendly greeting of at most 5 words"),
});

/** GET /api/ai/health — one tiny Gemini call to prove the key + model work. */
export async function GET() {
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
