import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Answer, Question } from "@/lib/types";

export interface MyAnswerItem {
  answer_id: string;
  question_id: string;
  subject: string;
  question_title: string;
  /** First part of the teacher's answer. */
  excerpt: string;
  answer_upvotes: number;
  question_upvotes: number;
  is_best: boolean;
  created_at: string;
}

/** Questions the signed-in teacher has answered, newest answer first (uses their own session, so RLS applies). */
export async function listMyAnswers(userId: string, limit = 100): Promise<MyAnswerItem[]> {
  const supabase = await createClient();
  const { data: answers } = await supabase
    .from("answers")
    .select("id, question_id, body, upvotes, created_at")
    .eq("author_id", userId)
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = (answers ?? []) as Pick<Answer, "id" | "question_id" | "body" | "upvotes" | "created_at">[];
  if (rows.length === 0) return [];

  const { data: questions } = await supabase
    .from("questions")
    .select("id, subject, title, upvotes, best_answer_id")
    .in("id", [...new Set(rows.map((a) => a.question_id))]);
  const byId = new Map(
    ((questions ?? []) as Pick<Question, "id" | "subject" | "title" | "upvotes" | "best_answer_id">[]).map((q) => [q.id, q]),
  );

  return rows.flatMap((a) => {
    const q = byId.get(a.question_id);
    if (!q) return [];
    return [
      {
        answer_id: a.id,
        question_id: q.id,
        subject: q.subject,
        question_title: q.title,
        excerpt: a.body.length > 180 ? `${a.body.slice(0, 177)}…` : a.body,
        answer_upvotes: a.upvotes,
        question_upvotes: q.upvotes,
        is_best: q.best_answer_id === a.id,
        created_at: a.created_at,
      },
    ];
  });
}
