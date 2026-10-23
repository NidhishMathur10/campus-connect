import { NextResponse } from "next/server";
import { z } from "zod";
import { QA_ANSWER_ROLES } from "@/config/qa";
import { moderatePost, ModerateRequestSchema, type ModerationResult } from "@/lib/ai/qa";
import { getCurrentProfile } from "@/lib/auth";

export type ModerateResponse = ({ ok: true } & ModerationResult) | { ok: false; error: string };

/**
 * POST /api/ai/moderate — CLAUDE.md §6.5 moderateQuestion, for questions, answers and
 * comments. The browser calls it before posting to show a polite reason inline; the post
 * action re-checks with the same (cached) result, so skipping this call doesn't bypass it.
 */
export async function POST(request: Request) {
  const reply = (body: ModerateResponse, status = 200) => NextResponse.json(body, { status });
  const { profile } = await getCurrentProfile();
  if (!profile || !QA_ANSWER_ROLES.includes(profile.role)) return reply({ ok: false, error: "Not allowed." }, 403);

  const parsed = ModerateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: z.prettifyError(parsed.error) }, 400);

  const result = await moderatePost(profile.id, parsed.data);
  return reply({ ok: true, ...result });
}
