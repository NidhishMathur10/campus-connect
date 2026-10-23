"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentTerm, FEEDBACK_MIN_RESPONSES, MODERATION_MESSAGES_FEEDBACK } from "@/config/feedback";
import { DOUBT_SUBJECTS } from "@/config/subjects";
import { moderateFeedbackText } from "@/lib/ai/feedback";
import { getCurrentProfile } from "@/lib/auth";
import { inBackground } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshSummary } from "./queries";
import type { FeedbackResult } from "./types";

/**
 * Rate a teacher, anonymously (CLAUDE.md §22). student_id is stored only to enforce one rating per
 * (student, teacher, subject, term) and is never read back for anyone else. Moderation is one Gemini
 * call, and only when a comment was written.
 */
const score = z.number().int().min(1, "Rate every question from 1 to 5.").max(5);
const FeedbackSchema = z.object({
  teacherId: z.uuid(),
  subject: z.enum(DOUBT_SUBJECTS as [string, ...string[]], "Choose a subject."),
  clarity: score,
  doubt_solving: score,
  punctuality: score,
  fairness: score,
  respect: score,
  comment: z.string().trim().max(1000, "Keep the comment under 1000 characters.").optional(),
});

export async function submitFeedback(input: z.input<typeof FeedbackSchema>): Promise<FeedbackResult> {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "student") return { ok: false, error: "Only students can rate teachers." };
  const parsed = FeedbackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your ratings." };
  const { teacherId, subject, comment, ...scores } = parsed.data;

  const admin = createAdminClient();
  const term = currentTerm();
  const { data: teacher } = await admin.from("profiles").select("id, full_name, subjects").eq("id", teacherId).eq("role", "teacher").maybeSingle();
  if (!teacher || !((teacher.subjects as string[] | null) ?? []).includes(subject)) {
    return { ok: false, error: "That teacher doesn't teach this subject." };
  }
  const { data: existing } = await admin
    .from("teacher_feedback")
    .select("id")
    .eq("student_id", profile.id)
    .eq("teacher_id", teacherId)
    .eq("subject", subject)
    .eq("term", term)
    .maybeSingle();
  if (existing) return { ok: false, error: `You have already rated ${teacher.full_name} for ${subject} this term.` };

  let neutral: string | null = null;
  let unchecked = false;
  const text = comment?.trim() ?? "";
  if (text.length > 0) {
    const mod = await moderateFeedbackText({
      kind: "feedback",
      text,
      context: `Feedback about ${teacher.full_name} (${subject}). Average rating given: ${(
        (scores.clarity + scores.doubt_solving + scores.punctuality + scores.fairness + scores.respect) / 5
      ).toFixed(1)}/5.`,
    });
    if (mod.level === "rephrase") return { ok: false, level: "rephrase", error: MODERATION_MESSAGES_FEEDBACK.rephrase };
    if (mod.level === "block") return { ok: false, level: "block", error: mod.reason || MODERATION_MESSAGES_FEEDBACK.block };
    neutral = mod.neutral_summary;
    unchecked = mod.unchecked;
  }

  const { error } = await admin.from("teacher_feedback").insert({
    student_id: profile.id,
    teacher_id: teacherId,
    subject,
    term,
    ...scores,
    comment: text || null,
    neutral_summary: neutral,
    moderation: unchecked ? "unchecked" : "passed",
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: `You have already rated ${teacher.full_name} for ${subject} this term.` };
    console.error("[submitFeedback]", error.message);
    return { ok: false, error: "Could not save your feedback. Please try again." };
  }

  // Refresh the cached AI themes when this response makes (or keeps) the group visible.
  inBackground(async () => {
    const { count } = await createAdminClient()
      .from("teacher_feedback")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .eq("subject", subject)
      .eq("term", term);
    if ((count ?? 0) >= FEEDBACK_MIN_RESPONSES && text) await refreshSummary(teacherId, subject, term);
  });
  revalidatePath("/education");
  revalidatePath("/feedback");
  revalidatePath("/teacher-feedback");
  return { ok: true };
}
