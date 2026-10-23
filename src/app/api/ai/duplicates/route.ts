import { NextResponse } from "next/server";
import { z } from "zod";
import { DuplicateRequestSchema, type DuplicateResponse } from "@/lib/ai/complaint";
import { findDuplicates } from "@/lib/ai/duplicates";
import { getCurrentProfile } from "@/lib/auth";

/** POST /api/ai/duplicates — CLAUDE.md §6.4: "may already be reported as CC-xxxx?" */
export async function POST(request: Request) {
  const reply = (body: DuplicateResponse, status = 200) => NextResponse.json(body, { status });

  const { userId, profile } = await getCurrentProfile();
  if (!userId || !profile) return reply({ ok: false, error: "Please log in again." }, 401);

  const parsed = DuplicateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: z.prettifyError(parsed.error) }, 400);

  try {
    const result = await findDuplicates(parsed.data, userId);
    if (!result.ok) console.error("[api/ai/duplicates]", result.error);
    return reply(result);
  } catch (err) {
    console.error("[api/ai/duplicates]", err);
    return reply({ ok: false, error: "Duplicate check failed." });
  }
}
