import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeLostFound } from "@/lib/ai/lost-found";
import { LF_REPORTER_ROLES } from "@/config/lost-found";
import { getCurrentProfile } from "@/lib/auth";
import { LfAnalyzeRequestSchema, type LfAnalyzeResponse } from "@/lib/lost-found/analysis";
import { deleteStoredPhoto, logModeration } from "@/lib/moderation";
import { downloadComplaintPhoto } from "@/lib/photos";

/** POST /api/lost-found/analyze — one Gemini call: listing details + the usual text / photo moderation. */
export async function POST(request: Request) {
  const reply = (body: LfAnalyzeResponse, status = 200) => NextResponse.json(body, { status });

  const { userId, profile } = await getCurrentProfile();
  if (!userId || !profile) return reply({ ok: false, error: "Please log in again." }, 401);
  if (!LF_REPORTER_ROLES.includes(profile.role)) {
    return reply({ ok: false, error: "Only students and faculty can post lost or found items." }, 403);
  }

  const parsed = LfAnalyzeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: z.prettifyError(parsed.error) }, 400);
  const body = parsed.data;

  let photo: { base64: string; mimeType: string } | null = null;
  if (body.photoPath) {
    if (!body.photoPath.startsWith(`${userId}/`)) return reply({ ok: false, error: "That photo doesn't belong to you." }, 403);
    photo = await downloadComplaintPhoto(body.photoPath);
    // A photo we can't read can't be moderated: same as "AI unavailable" (the client continues by hand).
    if (!photo) return reply({ ok: false, error: "Our AI assistant couldn't read this right now." });
  }

  const result = await analyzeLostFound({ ...body, photo });
  if (!result.ok) {
    console.error("[api/lost-found/analyze]", result.error);
    // 200 on purpose: the UI treats this as "AI unavailable, fill it in by hand".
    return reply({ ok: false, error: "Our AI assistant couldn't read this right now." });
  }

  const analysis = result.data;
  const photoLevel = analysis.moderation.photo?.level;
  const photoRemoved = photoLevel === "block" || photoLevel === "privacy";
  if (photoRemoved) {
    analysis.photo_analysis = null;
    if (body.photoPath) await deleteStoredPhoto(body.photoPath);
  }
  await logModeration(profile, "lost_found", analysis.moderation);

  return reply({ ok: true, analysis, photoRemoved });
}
