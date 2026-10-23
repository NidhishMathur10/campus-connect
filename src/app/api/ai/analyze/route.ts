import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeComplaint } from "@/lib/ai/analyze";
import { AnalyzeRequestSchema, type AnalyzeResponse } from "@/lib/ai/complaint";
import { audienceOf, isFaculty } from "@/config/faculty";
import { getCurrentProfile } from "@/lib/auth";
import { logModeration, deleteStoredPhoto } from "@/lib/moderation";
import { downloadComplaintPhoto } from "@/lib/photos";

/** POST /api/ai/analyze — CLAUDE.md §6.1 analyzeComplaint for the signed-in student or faculty member. */
export async function POST(request: Request) {
  const reply = (body: AnalyzeResponse, status = 200) => NextResponse.json(body, { status });

  const { userId, profile } = await getCurrentProfile();
  if (!userId || !profile) return reply({ ok: false, error: "Please log in again." }, 401);

  const parsed = AnalyzeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return reply({ ok: false, error: z.prettifyError(parsed.error) }, 400);
  }
  const body = parsed.data;
  // Faculty report Academic issues only; Hostel and Safety stay student-only.
  if (isFaculty(profile.role) && body.module !== "academic") {
    return reply({ ok: false, error: "Faculty can report academic and campus issues only." }, 403);
  }
  if (profile.role !== "student" && !isFaculty(profile.role)) {
    return reply({ ok: false, error: "Only students and faculty can report issues." }, 403);
  }

  // Only the first round looks at the photo; round 2 reuses that analysis.
  let photo: { base64: string; mimeType: string } | null = null;
  if (body.photoPath && !body.followUp) {
    if (!body.photoPath.startsWith(`${userId}/`)) {
      return reply({ ok: false, error: "That photo doesn't belong to you." }, 403);
    }
    photo = await downloadComplaintPhoto(body.photoPath);
    // Can't read the photo, so it can't be moderated: same as "AI unavailable" (the ticket is marked "Not moderated").
    if (!photo) return reply({ ok: false, error: "Our AI assistant couldn't read this right now." });
  }

  const result = await analyzeComplaint({
    module: body.module,
    text: body.text,
    location: body.location,
    photo,
    followUp: body.followUp ?? null,
    previousPhotoAnalysis: body.previousPhotoAnalysis ?? null,
    audience: audienceOf(profile.role),
  });

  if (!result.ok) {
    console.error("[api/ai/analyze]", result.error);
    // 200 on purpose: the UI treats this as "AI unavailable, continue manually".
    return reply({ ok: false, error: "Our AI assistant couldn't read this right now." });
  }

  // Moderation came back with the analysis (same Gemini call). Rejected photos are never kept.
  const analysis = result.data;
  const photoLevel = analysis.moderation.photo?.level;
  const photoRemoved = photoLevel === "block" || photoLevel === "privacy";
  if (photoRemoved) {
    analysis.photo_analysis = null; // never keep a description of a rejected photo
    if (body.photoPath) await deleteStoredPhoto(body.photoPath);
  }
  await logModeration(profile, body.module, analysis.moderation);

  return reply({ ok: true, analysis, photoRemoved });
}
