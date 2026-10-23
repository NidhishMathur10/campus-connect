import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeComplaint } from "@/lib/ai/analyze";
import { AnalyzeRequestSchema, type AnalyzeResponse } from "@/lib/ai/complaint";
import { getCurrentProfile } from "@/lib/auth";
import { downloadComplaintPhoto } from "@/lib/photos";

/** POST /api/ai/analyze — CLAUDE.md §6.1 analyzeComplaint for the signed-in student. */
export async function POST(request: Request) {
  const reply = (body: AnalyzeResponse, status = 200) => NextResponse.json(body, { status });

  const { userId, profile } = await getCurrentProfile();
  if (!userId || !profile) return reply({ ok: false, error: "Please log in again." }, 401);

  const parsed = AnalyzeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return reply({ ok: false, error: z.prettifyError(parsed.error) }, 400);
  }
  const body = parsed.data;

  // Only the first round looks at the photo; round 2 reuses that analysis.
  let photo: { base64: string; mimeType: string } | null = null;
  if (body.photoPath && !body.followUp) {
    if (!body.photoPath.startsWith(`${userId}/`)) {
      return reply({ ok: false, error: "That photo doesn't belong to you." }, 403);
    }
    photo = await downloadComplaintPhoto(body.photoPath);
  }

  const result = await analyzeComplaint({
    module: body.module,
    text: body.text,
    location: body.location,
    photo,
    followUp: body.followUp ?? null,
    previousPhotoAnalysis: body.previousPhotoAnalysis ?? null,
  });

  if (!result.ok) {
    console.error("[api/ai/analyze]", result.error);
    // 200 on purpose: the UI treats this as "AI unavailable, continue manually".
    return reply({ ok: false, error: "Our AI assistant couldn't read this right now." });
  }
  return reply({ ok: true, analysis: result.data });
}
