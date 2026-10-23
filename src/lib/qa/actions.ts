"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { QA_ANSWER_ROLES, QA_MODERATOR_ROLES, QA_SUBJECTS } from "@/config/qa";
import { getCurrentProfile } from "@/lib/auth";
import { moderatePost, type ModerateRequest } from "@/lib/ai/qa";
import { notify } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/tickets/actions";
import type { Profile, Question } from "@/lib/types";

/**
 * Q&A writes. Every post is tied to the signed-in profile (never a typed name or roll
 * number) and goes through Gemini moderation first. Writes use the service role after
 * the checks below; RLS is the safety net for direct API use.
 */

/** Blocked by moderation: `blocked` carries the polite reason to show inline. */
export type PostResult<T = object> = ActionResult<T & { pending_review: boolean }> | { ok: false; error: string; blocked: true };

const isTeacher = (p: Profile) => QA_MODERATOR_ROLES.includes(p.role);

function refreshQa(questionId?: string) {
  revalidatePath("/education");
  revalidatePath("/qa");
  if (questionId) {
    revalidatePath(`/education/qa/${questionId}`);
    revalidatePath(`/qa/${questionId}`);
  }
}

async function requirePoster(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && QA_ANSWER_ROLES.includes(profile.role) ? profile : null;
}

async function moderate(profile: Profile, req: ModerateRequest) {
  const res = await moderatePost(profile.id, req);
  return res.allowed ? { ok: true as const, pending: res.pending_review } : { ok: false as const, error: res.reason, blocked: true as const };
}

/** Question title for notifications / moderation context (service role: may be hidden). */
async function loadQuestion(id: string): Promise<Question | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient().from("questions").select("*").eq("id", id).maybeSingle();
  return data as Question | null;
}

/** Student link for students, teacher link for everyone else. */
const studentLink = (questionId: string) => `/education/qa/${questionId}`;

// ---------------------------------------------------------------------------
// Ask
// ---------------------------------------------------------------------------
const AskSchema = z.object({
  title: z.string().trim().min(10, "Make the title a full question (at least 10 characters).").max(160),
  body: z.string().trim().min(10, "Add a few details (at least 10 characters).").max(4000),
  subject: z.enum(QA_SUBJECTS, "Choose a subject."),
});

export async function askQuestion(input: z.input<typeof AskSchema>): Promise<PostResult<{ id: string }>> {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "student") return { ok: false, error: "Only students can ask questions." };
  const parsed = AskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your question." };
  const { title, body, subject } = parsed.data;

  const mod = await moderate(profile, { kind: "question", title, text: body });
  if (!mod.ok) return mod;

  const { data, error } = await createAdminClient()
    .from("questions")
    .insert({ author_id: profile.id, subject, title, body, pending_review: mod.pending })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[askQuestion]", error?.message);
    return { ok: false, error: "Could not post your question. Please try again." };
  }
  refreshQa();
  return { ok: true, id: data.id, pending_review: mod.pending };
}

// ---------------------------------------------------------------------------
// Answer
// ---------------------------------------------------------------------------
export async function postAnswer(questionId: string, text: string): Promise<PostResult<{ id: string }>> {
  const profile = await requirePoster();
  if (!profile) return { ok: false, error: "Only students and teachers can answer." };
  const body = text.trim();
  if (body.length < 2) return { ok: false, error: "Write your answer first." };
  if (body.length > 5000) return { ok: false, error: "Keep the answer under 5000 characters." };
  const question = await loadQuestion(questionId);
  if (!question || (question.hidden && !isTeacher(profile))) return { ok: false, error: "That question is no longer available." };

  const mod = await moderate(profile, { kind: "answer", text: body, context: question.title });
  if (!mod.ok) return mod;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("answers")
    .insert({ question_id: question.id, author_id: profile.id, body, pending_review: mod.pending })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[postAnswer]", error?.message);
    return { ok: false, error: "Could not post your answer. Please try again." };
  }

  // A teacher's answer counts as "answered"; remember when the first one came.
  if (isTeacher(profile)) {
    await admin
      .from("questions")
      .update({ status: "answered", answered_at: question.answered_at ?? new Date().toISOString() })
      .eq("id", question.id);
  }
  if (question.author_id !== profile.id) {
    await notify([
      {
        user_id: question.author_id,
        kind: "answer",
        title: `${profile.full_name} answered your question`,
        body: question.title,
        link: studentLink(question.id),
      },
    ]);
  }
  refreshQa(question.id);
  return { ok: true, id: data.id, pending_review: mod.pending };
}

// ---------------------------------------------------------------------------
// Comment (under an answer)
// ---------------------------------------------------------------------------
export async function postComment(answerId: string, text: string): Promise<PostResult> {
  const profile = await requirePoster();
  if (!profile) return { ok: false, error: "Only students and teachers can comment." };
  const body = text.trim();
  if (body.length < 2) return { ok: false, error: "Write your comment first." };
  if (body.length > 1000) return { ok: false, error: "Keep comments under 1000 characters." };
  if (!z.uuid().safeParse(answerId).success) return { ok: false, error: "Unknown answer." };

  const admin = createAdminClient();
  const { data: answer } = await admin.from("answers").select("id, question_id, author_id, hidden").eq("id", answerId).maybeSingle();
  const question = answer ? await loadQuestion(answer.question_id) : null;
  if (!answer || !question || ((answer.hidden || question.hidden) && !isTeacher(profile))) {
    return { ok: false, error: "That answer is no longer available." };
  }

  const mod = await moderate(profile, { kind: "comment", text: body, context: question.title });
  if (!mod.ok) return mod;

  const { error } = await admin
    .from("answer_comments")
    .insert({ answer_id: answer.id, author_id: profile.id, body, pending_review: mod.pending });
  if (error) {
    console.error("[postComment]", error.message);
    return { ok: false, error: "Could not post your comment. Please try again." };
  }
  if (answer.author_id !== profile.id) {
    await notify([
      {
        user_id: answer.author_id,
        kind: "comment",
        title: `${profile.full_name} commented on your answer`,
        body: question.title,
        link: studentLink(question.id),
      },
    ]);
  }
  refreshQa(question.id);
  return { ok: true, pending_review: mod.pending };
}

// ---------------------------------------------------------------------------
// Votes (one per user; toggling removes it)
// ---------------------------------------------------------------------------
export async function toggleQuestionVote(questionId: string): Promise<ActionResult<{ voted: boolean }>> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  const question = await loadQuestion(questionId);
  if (!question || question.hidden) return { ok: false, error: "That question is no longer available." };
  if (question.author_id === profile.id) return { ok: false, error: "You can't upvote your own question." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("question_votes")
    .select("question_id")
    .eq("question_id", question.id)
    .eq("user_id", profile.id)
    .maybeSingle();
  const { error } = existing
    ? await admin.from("question_votes").delete().eq("question_id", question.id).eq("user_id", profile.id)
    : await admin.from("question_votes").insert({ question_id: question.id, user_id: profile.id });
  if (error && error.code !== "23505") return { ok: false, error: "Could not save your vote." };
  refreshQa(question.id);
  return { ok: true, voted: !existing };
}

export async function toggleAnswerVote(answerId: string): Promise<ActionResult<{ voted: boolean }>> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(answerId).success) return { ok: false, error: "Unknown answer." };
  const admin = createAdminClient();
  const { data: answer } = await admin.from("answers").select("id, question_id, author_id, hidden").eq("id", answerId).maybeSingle();
  if (!answer || answer.hidden) return { ok: false, error: "That answer is no longer available." };
  if (answer.author_id === profile.id) return { ok: false, error: "You can't upvote your own answer." };

  const { data: existing } = await admin
    .from("answer_votes")
    .select("answer_id")
    .eq("answer_id", answer.id)
    .eq("user_id", profile.id)
    .maybeSingle();
  const { error } = existing
    ? await admin.from("answer_votes").delete().eq("answer_id", answer.id).eq("user_id", profile.id)
    : await admin.from("answer_votes").insert({ answer_id: answer.id, user_id: profile.id });
  if (error && error.code !== "23505") return { ok: false, error: "Could not save your vote." };
  refreshQa(answer.question_id);
  return { ok: true, voted: !existing };
}

// ---------------------------------------------------------------------------
// Best answer: the asker or any teacher
// ---------------------------------------------------------------------------
export async function markBestAnswer(questionId: string, answerId: string): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  const question = await loadQuestion(questionId);
  if (!question) return { ok: false, error: "That question is no longer available." };
  if (question.author_id !== profile.id && !isTeacher(profile)) {
    return { ok: false, error: "Only the student who asked (or a teacher) can choose the best answer." };
  }
  const admin = createAdminClient();
  const { data: answer } = await admin.from("answers").select("id, question_id, author_id, hidden").eq("id", answerId).maybeSingle();
  if (!answer || answer.question_id !== question.id || answer.hidden) return { ok: false, error: "That answer is no longer available." };

  const unmark = question.best_answer_id === answer.id;
  const { error } = await admin
    .from("questions")
    .update({
      best_answer_id: unmark ? null : answer.id,
      // Unmarking keeps "answered" only if a teacher has answered.
      status: unmark ? (question.answered_at ? "answered" : "open") : "answered",
    })
    .eq("id", question.id);
  if (error) return { ok: false, error: "Could not update the best answer." };

  if (!unmark && answer.author_id !== profile.id) {
    await notify([
      {
        user_id: answer.author_id,
        kind: "best_answer",
        title: "Your answer was marked as the best answer",
        body: question.title,
        link: studentLink(question.id),
      },
    ]);
  }
  refreshQa(question.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Teachers: hide (soft delete with reason) / approve "pending review" posts
// ---------------------------------------------------------------------------
const TABLES = { question: "questions", answer: "answers", comment: "answer_comments" } as const;
type PostType = keyof typeof TABLES;

async function questionIdOf(kind: PostType, id: string): Promise<string | null> {
  const admin = createAdminClient();
  if (kind === "question") return id;
  if (kind === "answer") {
    const { data } = await admin.from("answers").select("question_id").eq("id", id).maybeSingle();
    return data?.question_id ?? null;
  }
  const { data } = await admin.from("answer_comments").select("answers(question_id)").eq("id", id).maybeSingle();
  const rel = data?.answers as { question_id: string } | { question_id: string }[] | null | undefined;
  return (Array.isArray(rel) ? rel[0]?.question_id : rel?.question_id) ?? null;
}

export async function hidePost(kind: PostType, id: string, reason: string): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile || !isTeacher(profile)) return { ok: false, error: "Only teachers can hide posts." };
  if (!(kind in TABLES) || !z.uuid().safeParse(id).success) return { ok: false, error: "Unknown post." };
  const why = reason.trim();
  if (why.length < 3) return { ok: false, error: "Give a short reason (the author will see it)." };

  const patch: Record<string, unknown> = { hidden: true, hidden_reason: why.slice(0, 300), pending_review: false };
  if (kind !== "comment") patch.hidden_by = profile.id;
  const { error } = await createAdminClient().from(TABLES[kind]).update(patch).eq("id", id);
  if (error) return { ok: false, error: "Could not hide the post." };
  refreshQa((await questionIdOf(kind, id)) ?? undefined);
  return { ok: true };
}

export async function unhidePost(kind: PostType, id: string): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile || !isTeacher(profile)) return { ok: false, error: "Only teachers can restore posts." };
  if (!(kind in TABLES) || !z.uuid().safeParse(id).success) return { ok: false, error: "Unknown post." };
  const { error } = await createAdminClient().from(TABLES[kind]).update({ hidden: false, hidden_reason: null }).eq("id", id);
  if (error) return { ok: false, error: "Could not restore the post." };
  refreshQa((await questionIdOf(kind, id)) ?? undefined);
  return { ok: true };
}

export async function approvePost(kind: PostType, id: string): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile || !isTeacher(profile)) return { ok: false, error: "Only teachers can approve posts." };
  if (!(kind in TABLES) || !z.uuid().safeParse(id).success) return { ok: false, error: "Unknown post." };
  const { error } = await createAdminClient().from(TABLES[kind]).update({ pending_review: false }).eq("id", id);
  if (error) return { ok: false, error: "Could not approve the post." };
  refreshQa((await questionIdOf(kind, id)) ?? undefined);
  return { ok: true };
}
