import "server-only";
import { currentTerm, FEEDBACK_MIN_RESPONSES, FEEDBACK_QUESTIONS, type FeedbackKey } from "@/config/feedback";
import { summariseFeedback, type FeedbackSummary } from "@/lib/ai/feedback";
import { listTeachers } from "@/lib/doubts/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeedbackComment, RateableTeacher, Scores, TeacherSubjectStats } from "./types";

/**
 * Reads for anonymous teacher feedback (CLAUDE.md §22). Everything here uses the service role, so this
 * file is the safeguard: it never selects `student_id` or `created_at` for anyone's browser. The only
 * student_id read is `listRateableTeachers`, filtered to the signed-in student's own rows.
 */
const ANON_COLUMNS = "id, teacher_id, subject, clarity, doubt_solving, punctuality, fairness, respect, comment, neutral_summary, moderation";

interface AnonRow {
  id: string;
  teacher_id: string;
  subject: string;
  clarity: number;
  doubt_solving: number;
  punctuality: number;
  fairness: number;
  respect: number;
  comment: string | null;
  neutral_summary: string | null;
  moderation: "passed" | "unchecked";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function averagesOf(rows: Pick<AnonRow, FeedbackKey>[]): { averages: Scores; overall: number } {
  const averages = Object.fromEntries(
    FEEDBACK_QUESTIONS.map((q) => [q.key, round1(rows.reduce((s, r) => s + r[q.key], 0) / rows.length)]),
  ) as Scores;
  const overall = round1(FEEDBACK_QUESTIONS.reduce((s, q) => s + averages[q.key], 0) / FEEDBACK_QUESTIONS.length);
  return { averages, overall };
}

/** Every (teacher, subject) a student can rate, and whether they already did this term. */
export async function listRateableTeachers(studentId: string): Promise<RateableTeacher[]> {
  const admin = createAdminClient();
  const [teachers, { data: mine }] = await Promise.all([
    listTeachers(),
    admin.from("teacher_feedback").select("teacher_id, subject").eq("student_id", studentId).eq("term", currentTerm()),
  ]);
  const done = new Set((mine ?? []).map((r) => `${r.teacher_id}|${r.subject}`));
  return teachers.flatMap((t) =>
    t.subjects.map((subject) => ({ teacherId: t.id, teacherName: t.name, subject, rated: done.has(`${t.id}|${subject}`) })),
  );
}

// ---------------------------------------------------------------------------
// Cached AI themes
// ---------------------------------------------------------------------------
const inflight = new Map<string, Promise<FeedbackSummary | null>>();

/** Regenerates the themes for one teacher/subject/term and caches them. Null when Gemini is unavailable. */
export function refreshSummary(teacherId: string, subject: string, term = currentTerm()): Promise<FeedbackSummary | null> {
  const key = `${teacherId}|${subject}|${term}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const admin = createAdminClient();
    const [{ data }, { data: teacher }] = await Promise.all([
      admin.from("teacher_feedback").select(ANON_COLUMNS).eq("teacher_id", teacherId).eq("subject", subject).eq("term", term),
      admin.from("profiles").select("full_name").eq("id", teacherId).maybeSingle(),
    ]);
    const rows = (data ?? []) as AnonRow[];
    if (rows.length < FEEDBACK_MIN_RESPONSES) return null;
    const comments = rows.map((r) => r.neutral_summary || r.comment).filter((c): c is string => !!c && c.trim().length > 0);
    const res = await summariseFeedback({
      teacher: teacher?.full_name ?? "the teacher",
      subject,
      averages: averagesOf(rows).averages,
      comments,
    });
    if (!res.ok) {
      console.error("[feedback summary]", res.error);
      return null;
    }
    await admin.from("feedback_summaries").upsert({
      teacher_id: teacherId,
      subject,
      term,
      response_count: rows.length,
      summary: res.data,
      model: res.model,
      generated_at: new Date().toISOString(),
    });
    return res.data;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Cached themes, regenerated when the number of responses changed since they were written. */
async function summaryFor(teacherId: string, subject: string, term: string, count: number): Promise<FeedbackSummary | null> {
  const { data } = await createAdminClient()
    .from("feedback_summaries")
    .select("response_count, summary")
    .eq("teacher_id", teacherId)
    .eq("subject", subject)
    .eq("term", term)
    .maybeSingle();
  if (data && data.response_count === count) return data.summary as FeedbackSummary;
  return refreshSummary(teacherId, subject, term);
}

/**
 * Stats per teacher/subject for the current term. `teacherId` limits to one teacher (their own page);
 * `withComments` is for the HOD / Dean. Below FEEDBACK_MIN_RESPONSES only the count is returned.
 */
export async function getFeedbackStats(opts: { teacherId?: string; withComments: boolean }): Promise<TeacherSubjectStats[]> {
  const term = currentTerm();
  const admin = createAdminClient();
  let q = admin.from("teacher_feedback").select(ANON_COLUMNS).eq("term", term);
  if (opts.teacherId) q = q.eq("teacher_id", opts.teacherId);
  const [{ data }, teachers] = await Promise.all([q, listTeachers()]);
  const rows = (data ?? []) as AnonRow[];

  const stats = await Promise.all(
    teachers
      .filter((t) => !opts.teacherId || t.id === opts.teacherId)
      .flatMap((t) => {
        // Subjects with no responses yet, plus any subject that has some.
        const subjects = new Set([...t.subjects, ...rows.filter((r) => r.teacher_id === t.id).map((r) => r.subject)]);
        return [...subjects].map(async (subject): Promise<TeacherSubjectStats> => {
          const mine = rows.filter((r) => r.teacher_id === t.id && r.subject === subject);
          const visible = mine.length >= FEEDBACK_MIN_RESPONSES;
          const base = { teacherId: t.id, teacherName: t.name, subject, term, count: mine.length };
          if (!visible) return { ...base, visible, averages: null, overall: null, comments: [], summary: null };
          const { averages, overall } = averagesOf(mine);
          const comments: FeedbackComment[] = opts.withComments
            ? mine
                .filter((r) => r.comment?.trim())
                // Stable order unrelated to submission time.
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((r) => ({ id: r.id, comment: r.comment!, neutral_summary: r.neutral_summary, unchecked: r.moderation === "unchecked" }))
            : [];
          const hasComments = mine.some((r) => r.comment?.trim());
          const summary = hasComments ? await summaryFor(t.id, subject, term, mine.length) : null;
          return { ...base, visible, averages, overall, comments, summary };
        });
      }),
  );
  return stats.sort((a, b) => a.teacherName.localeCompare(b.teacherName) || a.subject.localeCompare(b.subject));
}
