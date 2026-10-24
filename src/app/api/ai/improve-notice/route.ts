import { NextResponse } from "next/server";
import { NOTICE_POSTER_ROLES } from "@/config/notices";
import { ImproveNoticeRequestSchema, improveNotice, type ImprovedNotice } from "@/lib/ai/notices";
import { getCurrentProfile } from "@/lib/auth";

export type ImproveNoticeResponse = { ok: true; notice: ImprovedNotice } | { ok: false; error: string };

/**
 * POST /api/ai/improve-notice — "Improve with AI" on the compose page. Returns suggestions only;
 * nothing is published until the author reviews, edits and clicks Publish.
 */
export async function POST(request: Request) {
  const reply = (body: ImproveNoticeResponse, status = 200) => NextResponse.json(body, { status });
  const { profile } = await getCurrentProfile();
  if (!profile || !NOTICE_POSTER_ROLES.includes(profile.role)) return reply({ ok: false, error: "You can't post notices." }, 403);

  const parsed = ImproveNoticeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: "Please write a few words first." }, 400);

  const res = await improveNotice(parsed.data);
  if (!res.ok) {
    console.error("[api/ai/improve-notice]", res.error);
    return reply({ ok: false, error: "The AI couldn't improve this right now — you can still edit and publish it yourself." });
  }
  return reply({ ok: true, notice: res.data });
}
