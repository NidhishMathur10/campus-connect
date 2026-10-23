import "server-only";
import { QA_ROLL_VISIBLE_ROLES, QA_SUBJECTS, type QaFilter } from "@/config/qa";
import type { Role } from "@/config/roles";
import { createClient } from "@/lib/supabase/server";
import type { Answer, AnswerComment, Profile, Question } from "@/lib/types";

/**
 * Q&A reads use the signed-in user's client, so RLS decides what is visible
 * (hidden posts only reach their author and teachers/admins). Author names come from
 * the public_profiles view; roll numbers are only fetched for roles allowed to see them
 * (and RLS on profiles blocks students from reading other students' rows anyway).
 */

export type QaViewer = Pick<Profile, "id" | "role">;

export interface QaAuthor {
  id: string;
  name: string;
  role: Role | null;
  /** Only filled for teachers / Academic Office / HOD / Dean viewers. */
  roll_no: string | null;
}

export interface QuestionListItem
  extends Pick<Question, "id" | "subject" | "title" | "body" | "status" | "upvotes" | "created_at" | "pending_review" | "hidden" | "hidden_reason"> {
  author: QaAuthor;
  answer_count: number;
  teacher_answered: boolean;
  is_mine: boolean;
  voted: boolean;
}

export interface CommentItem extends AnswerComment {
  author: QaAuthor;
}

export interface AnswerItem extends Answer {
  author: QaAuthor;
  is_best: boolean;
  is_teacher: boolean;
  voted: boolean;
  comments: CommentItem[];
}

export interface QuestionDetail {
  question: Question;
  author: QaAuthor;
  answers: AnswerItem[];
  voted: boolean;
  is_mine: boolean;
}

export const canSeeRollNumbers = (role: Role) => QA_ROLL_VISIBLE_ROLES.includes(role);

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadAuthors(supabase: Supabase, viewer: QaViewer, ids: string[]): Promise<Map<string, QaAuthor>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, QaAuthor>();
  if (unique.length === 0) return map;
  const [{ data: people }, rolls] = await Promise.all([
    supabase.from("public_profiles").select("id, full_name, role").in("id", unique),
    canSeeRollNumbers(viewer.role)
      ? supabase.from("profiles").select("id, roll_no").in("id", unique)
      : Promise.resolve({ data: [] as { id: string; roll_no: string | null }[] }),
  ]);
  const rollById = new Map((rolls.data ?? []).map((r) => [r.id, r.roll_no as string | null]));
  for (const p of (people ?? []) as { id: string; full_name: string; role: Role }[]) {
    map.set(p.id, { id: p.id, name: p.full_name, role: p.role, roll_no: rollById.get(p.id) ?? null });
  }
  return map;
}

/** Shown instead of the asker on questions that were made public from a private doubt. */
export const ANONYMOUS_AUTHOR: QaAuthor = { id: "anonymous", name: "Anonymous student", role: null, roll_no: null };

export const unknownAuthor = (id: string): QaAuthor => ({ id, name: "Student", role: null, roll_no: null });

/** Strip characters that would break a PostgREST `or=(...)` filter. */
function cleanSearch(q: string): string {
  return q.replace(/[%,()*\\"'.:]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function listQuestions(
  viewer: QaViewer,
  opts: { subject?: string | null; filter?: QaFilter; q?: string | null; limit?: number } = {},
): Promise<QuestionListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("questions")
    .select("id, author_id, anonymous, subject, title, body, status, upvotes, created_at, pending_review, hidden, hidden_reason")
    .limit(opts.limit ?? 60);

  if (opts.subject && (QA_SUBJECTS as readonly string[]).includes(opts.subject)) query = query.eq("subject", opts.subject);
  if (opts.filter === "unanswered") query = query.eq("status", "open").eq("hidden", false);
  if (opts.filter === "mine") query = query.eq("author_id", viewer.id);
  const q = opts.q ? cleanSearch(opts.q) : "";
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
  query =
    opts.filter === "top"
      ? query.order("upvotes", { ascending: false }).order("created_at", { ascending: false })
      : opts.filter === "unanswered"
        ? query.order("created_at", { ascending: true })
        : query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) console.error("[listQuestions]", error.message);
  const rows = (data ?? []) as (Pick<Question, "author_id" | "anonymous"> & Omit<QuestionListItem, "author" | "answer_count" | "teacher_answered" | "is_mine" | "voted">)[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: answers }, { data: votes }] = await Promise.all([
    supabase.from("answers").select("question_id, author_id").in("question_id", ids).eq("hidden", false),
    supabase.from("question_votes").select("question_id").in("question_id", ids).eq("user_id", viewer.id),
  ]);
  const answerRows = (answers ?? []) as { question_id: string; author_id: string }[];
  const authors = await loadAuthors(supabase, viewer, [...rows.map((r) => r.author_id), ...answerRows.map((a) => a.author_id)]);
  const voted = new Set((votes ?? []).map((v) => v.question_id as string));

  return rows.map((r) => {
    const mine = answerRows.filter((a) => a.question_id === r.id);
    return {
      ...r,
      author: r.anonymous ? ANONYMOUS_AUTHOR : (authors.get(r.author_id) ?? unknownAuthor(r.author_id)),
      answer_count: mine.length,
      teacher_answered: mine.some((a) => authors.get(a.author_id)?.role === "teacher"),
      is_mine: r.author_id === viewer.id,
      voted: voted.has(r.id),
    };
  });
}

export async function getQuestionDetail(id: string, viewer: QaViewer): Promise<QuestionDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("questions").select("*").eq("id", id).maybeSingle();
  const question = data as Question | null;
  if (!question) return null;

  const [{ data: answerRows }, { data: qVote }] = await Promise.all([
    supabase.from("answers").select("*").eq("question_id", id).order("created_at", { ascending: true }),
    supabase.from("question_votes").select("question_id").eq("question_id", id).eq("user_id", viewer.id).maybeSingle(),
  ]);
  const answers = (answerRows ?? []) as Answer[];
  const answerIds = answers.map((a) => a.id);
  const [{ data: commentRows }, { data: aVotes }] = answerIds.length
    ? await Promise.all([
        supabase.from("answer_comments").select("*").in("answer_id", answerIds).order("created_at", { ascending: true }),
        supabase.from("answer_votes").select("answer_id").in("answer_id", answerIds).eq("user_id", viewer.id),
      ])
    : [{ data: [] }, { data: [] }];
  const comments = (commentRows ?? []) as AnswerComment[];
  const votedAnswers = new Set((aVotes ?? []).map((v) => v.answer_id as string));

  const authors = await loadAuthors(supabase, viewer, [
    question.author_id,
    ...answers.map((a) => a.author_id),
    ...comments.map((c) => c.author_id),
  ]);
  const who = (uid: string) =>
    question.anonymous && uid === question.author_id ? ANONYMOUS_AUTHOR : (authors.get(uid) ?? unknownAuthor(uid));

  const items: AnswerItem[] = answers.map((a) => ({
    ...a,
    author: who(a.author_id),
    is_best: a.id === question.best_answer_id,
    is_teacher: who(a.author_id).role === "teacher",
    voted: votedAnswers.has(a.id),
    comments: comments.filter((c) => c.answer_id === a.id).map((c) => ({ ...c, author: who(c.author_id) })),
  }));
  // Best answer first, then teacher answers, then by votes, then oldest first.
  items.sort(
    (x, y) =>
      Number(y.is_best) - Number(x.is_best) ||
      Number(y.is_teacher) - Number(x.is_teacher) ||
      y.upvotes - x.upvotes ||
      x.created_at.localeCompare(y.created_at),
  );

  return { question, author: who(question.author_id), answers: items, voted: !!qVote, is_mine: question.author_id === viewer.id };
}

/** Teacher home: open (no teacher answer yet) questions, oldest first, grouped by subject. */
export async function getTeacherQueue(viewer: QaViewer): Promise<{ subject: string; questions: QuestionListItem[] }[]> {
  const open = await listQuestions(viewer, { filter: "unanswered", limit: 200 });
  const groups = new Map<string, QuestionListItem[]>();
  for (const q of open) groups.set(q.subject, [...(groups.get(q.subject) ?? []), q]);
  return [...groups.entries()]
    .map(([subject, questions]) => ({ subject, questions }))
    .sort((a, b) => b.questions.length - a.questions.length || a.questions[0].created_at.localeCompare(b.questions[0].created_at));
}

/** Posts waiting for a teacher's check because moderation was unavailable. */
export async function countPendingReview(): Promise<number> {
  const supabase = await createClient();
  const results = await Promise.all(
    (["questions", "answers", "answer_comments"] as const).map((t) =>
      supabase.from(t).select("id", { count: "exact", head: true }).eq("pending_review", true).eq("hidden", false),
    ),
  );
  return results.reduce((n, r) => n + (r.count ?? 0), 0);
}

// ---------------------------------------------------------------------------
// Insights (HOD / Dean)
// ---------------------------------------------------------------------------
export interface QaStats {
  questionsThisWeek: number;
  totalQuestions: number;
  answeredPct: number | null;
  avgFirstTeacherAnswerHours: number | null;
  topSubjects: { name: string; count: number }[];
  unanswered: number;
}

export async function getQaStats(days: number): Promise<QaStats> {
  const supabase = await createClient();
  const now = Date.now();
  const since = new Date(now - days * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("questions")
    .select("subject, status, created_at, answered_at")
    .eq("hidden", false)
    .gte("created_at", since)
    .limit(3000);
  if (error) console.error("[getQaStats]", error.message);
  const rows = (data ?? []) as Pick<Question, "subject" | "status" | "created_at" | "answered_at">[];
  const weekAgo = now - 7 * 86_400_000;
  const answered = rows.filter((r) => r.status === "answered");
  const firstAnswer = rows
    .filter((r) => r.answered_at)
    .map((r) => (new Date(r.answered_at!).getTime() - new Date(r.created_at).getTime()) / 3600_000);
  const bySubject = new Map<string, number>();
  for (const r of rows) bySubject.set(r.subject, (bySubject.get(r.subject) ?? 0) + 1);

  return {
    questionsThisWeek: rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length,
    totalQuestions: rows.length,
    answeredPct: rows.length ? Math.round((100 * answered.length) / rows.length) : null,
    avgFirstTeacherAnswerHours: firstAnswer.length ? firstAnswer.reduce((a, b) => a + b, 0) / firstAnswer.length : null,
    topSubjects: [...bySubject.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    unanswered: rows.length - answered.length,
  };
}
