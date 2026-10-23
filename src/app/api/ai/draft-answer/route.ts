import { NextResponse } from "next/server";
import { z } from "zod";
import { QA_MODERATOR_ROLES } from "@/config/qa";
import { draftAnswer } from "@/lib/ai/qa";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({ questionId: z.uuid() });

export type DraftResponse = { ok: true; draft: string } | { ok: false; error: string };

/**
 * POST /api/ai/draft-answer — teacher-only "Draft with AI". Returns text for the answer
 * box; nothing is posted until the teacher reviews, edits and clicks Post.
 */
export async function POST(request: Request) {
  const reply = (body: DraftResponse, status = 200) => NextResponse.json(body, { status });
  const { profile } = await getCurrentProfile();
  if (!profile || !QA_MODERATOR_ROLES.includes(profile.role)) return reply({ ok: false, error: "Only teachers can draft with AI." }, 403);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: "Unknown question." }, 400);

  const admin = createAdminClient();
  const [{ data: q }, { data: answers }] = await Promise.all([
    admin.from("questions").select("subject, title, body").eq("id", parsed.data.questionId).maybeSingle(),
    admin.from("answers").select("body").eq("question_id", parsed.data.questionId).eq("hidden", false).limit(5),
  ]);
  if (!q) return reply({ ok: false, error: "Unknown question." }, 404);

  const res = await draftAnswer({ ...q, existingAnswers: (answers ?? []).map((a) => a.body as string) });
  if (!res.ok) {
    console.error("[api/ai/draft-answer]", res.error);
    return reply({ ok: false, error: "The AI couldn't write a draft right now — please type your answer." });
  }
  return reply({ ok: true, draft: res.data.answer.trim() });
}
