import { NextResponse } from "next/server";
import { z } from "zod";
import type { QaSubject } from "@/config/qa";
import { similarQuestions } from "@/lib/ai/qa";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  title: z.string().trim().min(8).max(200),
  body: z.string().trim().max(2000).optional(),
});

export interface SimilarQuestion {
  id: string;
  title: string;
  subject: string;
  status: "open" | "answered";
  score: number;
}

export type SimilarResponse =
  | { ok: true; similar: SimilarQuestion[]; suggested_subject: QaSubject | null }
  | { ok: false; error: string };

/** POST /api/ai/similar-questions — CLAUDE.md §6.6: related existing questions + a suggested subject. */
export async function POST(request: Request) {
  const reply = (body: SimilarResponse, status = 200) => NextResponse.json(body, { status });
  const { profile } = await getCurrentProfile();
  if (!profile) return reply({ ok: false, error: "Please log in again." }, 401);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: "Type a longer title." }, 400);

  // RLS: only questions this user may see (hidden ones are excluded for students).
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select("id, title, subject, status")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(80);
  const rows = (data ?? []) as Omit<SimilarQuestion, "score">[];

  const res = await similarQuestions(parsed.data, rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return reply({
    ok: true,
    suggested_subject: res.suggested_subject,
    similar: res.similar.flatMap((m) => {
      const row = byId.get(m.id.trim());
      return row ? [{ ...row, score: m.score }] : [];
    }),
  });
}
