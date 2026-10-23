"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { QA_SUBJECTS } from "@/config/qa";
import { DOUBT_SUBJECTS, SUBJECT_ADMIN_ROLES } from "@/config/subjects";
import { moderatePost } from "@/lib/ai/qa";
import { getCurrentProfile } from "@/lib/auth";
import {
  notifyDoubtPublicRequest,
  notifyDoubtPublished,
  notifyDoubtReply,
  notifyDoubtToTeachers,
} from "@/lib/email/doubt-notify";
import { photoPublicUrl } from "@/lib/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/tickets/actions";
import type { Profile } from "@/lib/types";
import type { DoubtMessage, DoubtThread } from "./types";
import { canAccessThread, isStudentOf, isTeacherOf, type Viewer } from "./queries";

/**
 * "Ask my teacher" writes. The signed-in profile and thread access are checked here; writes use the
 * service role and RLS in schema.sql is the safety net. Every doubt and reply goes through the same
 * Gemini moderation as the public Q&A board (if the AI is down the text is allowed and flagged).
 */

export type DoubtResult<T = object> = ActionResult<T> | { ok: false; error: string; blocked: true };

const viewerOf = (p: Profile): Viewer => ({ id: p.id, role: p.role, subjects: p.subjects ?? [] });

function refresh(id?: string) {
  revalidatePath("/education");
  revalidatePath("/doubts");
  revalidatePath("/qa");
  if (id) {
    revalidatePath(`/education/doubts/${id}`);
    revalidatePath(`/doubts/${id}`);
  }
}

async function loadThread(id: string): Promise<DoubtThread | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient().from("doubt_threads").select("*").eq("id", id).maybeSingle();
  return (data as DoubtThread | null) ?? null;
}

async function systemMessage(threadId: string, body: string) {
  await createAdminClient().from("doubt_messages").insert({ thread_id: threadId, author_id: null, sender: "system", body });
}

// ---------------------------------------------------------------------------
// Ask
// ---------------------------------------------------------------------------
const AskSchema = z.object({
  subject: z.enum(DOUBT_SUBJECTS as [string, ...string[]], "Choose a subject."),
  title: z.string().trim().min(10, "Make the title a full question (at least 10 characters).").max(160),
  body: z.string().trim().min(10, "Add a few details (at least 10 characters).").max(4000),
  photoPath: z.string().max(300).nullable().optional(),
});

export async function askDoubt(input: z.input<typeof AskSchema>): Promise<DoubtResult<{ id: string }>> {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "student") return { ok: false, error: "Only students can ask a teacher." };
  const parsed = AskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your doubt." };
  const { subject, title, body, photoPath } = parsed.data;
  if (photoPath && !photoPath.startsWith(`${profile.id}/`)) return { ok: false, error: "That photo doesn't belong to you." };

  const admin = createAdminClient();
  const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "teacher").contains("subjects", [subject]);
  if (!count) return { ok: false, error: "No teacher is assigned to this subject yet. Please ask on the open Q&A board." };

  const mod = await moderatePost(profile.id, { kind: "question", title, text: body });
  if (!mod.allowed) return { ok: false, error: mod.reason, blocked: true };

  const { data: thread, error } = await admin
    .from("doubt_threads")
    .insert({ student_id: profile.id, subject, title, photo_path: photoPath ?? null, photo_url: photoPath ? photoPublicUrl(photoPath) : null })
    .select("id")
    .single();
  if (error || !thread) {
    console.error("[askDoubt]", error?.message);
    return { ok: false, error: "Could not send your doubt. Please try again." };
  }
  await admin.from("doubt_messages").insert({ thread_id: thread.id, author_id: profile.id, sender: "student", body, pending_review: mod.pending_review });

  notifyDoubtToTeachers({ id: thread.id, subject, title }, profile.full_name, false);
  refresh(thread.id);
  return { ok: true, id: thread.id };
}

// ---------------------------------------------------------------------------
// Reply (student follow-up or teacher answer)
// ---------------------------------------------------------------------------
export async function replyDoubt(threadId: string, text: string): Promise<DoubtResult<{ id: string }>> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  const thread = await loadThread(threadId);
  const v = viewerOf(profile);
  if (!thread || !canAccessThread(thread, v)) return { ok: false, error: "That doubt isn't available." };
  const student = isStudentOf(thread, v);
  if (!student && !isTeacherOf(thread, v)) return { ok: false, error: "Only the student and the subject's teachers can reply." };
  if (thread.status === "closed") return { ok: false, error: "This doubt is closed." };
  const body = text.trim();
  if (body.length < 2) return { ok: false, error: "Write your reply first." };
  if (body.length > 4000) return { ok: false, error: "Keep the reply under 4000 characters." };

  const mod = await moderatePost(profile.id, { kind: student ? "comment" : "answer", text: body, context: thread.title });
  if (!mod.allowed) return { ok: false, error: mod.reason, blocked: true };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: msg, error } = await admin
    .from("doubt_messages")
    .insert({ thread_id: thread.id, author_id: profile.id, sender: student ? "student" : "teacher", body, pending_review: mod.pending_review })
    .select("id")
    .single();
  if (error || !msg) {
    console.error("[replyDoubt]", error?.message);
    return { ok: false, error: "Could not send your reply. Please try again." };
  }

  await admin
    .from("doubt_threads")
    .update(
      student
        ? { status: "open", last_sender: "student", last_message_at: now, reminder_sent_at: null }
        : { status: "answered", last_sender: "teacher", last_message_at: now, answered_at: thread.answered_at ?? now },
    )
    .eq("id", thread.id);

  const ref = { id: thread.id, subject: thread.subject, title: thread.title };
  if (student) notifyDoubtToTeachers(ref, profile.full_name, true);
  else notifyDoubtReply(ref, thread.student_id, profile.full_name);
  refresh(thread.id);
  return { ok: true, id: msg.id };
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------
export async function closeDoubt(threadId: string): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  const thread = await loadThread(threadId);
  const v = viewerOf(profile);
  if (!thread || !(isStudentOf(thread, v) || isTeacherOf(thread, v))) return { ok: false, error: "That doubt isn't available." };
  if (thread.status === "closed") return { ok: true };
  await createAdminClient().from("doubt_threads").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", thread.id);
  await systemMessage(thread.id, `${profile.full_name} closed this doubt.`);
  refresh(thread.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Make public: the teacher proposes, the student decides, then it is posted anonymously
// ---------------------------------------------------------------------------
export async function requestPublic(threadId: string, messageId: string): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  const thread = await loadThread(threadId);
  if (!thread || !isTeacherOf(thread, viewerOf(profile))) return { ok: false, error: "Only the subject's teachers can do this." };
  if (thread.public_status === "requested" || thread.public_status === "published") return { ok: false, error: "This doubt was already shared or is waiting for the student." };
  if (!z.uuid().safeParse(messageId).success) return { ok: false, error: "Choose one of your replies." };

  const admin = createAdminClient();
  const { data: msg } = await admin.from("doubt_messages").select("*").eq("id", messageId).eq("thread_id", thread.id).maybeSingle();
  const answer = msg as DoubtMessage | null;
  if (!answer || answer.sender !== "teacher") return { ok: false, error: "Choose one of the teachers' replies." };

  await admin.from("doubt_threads").update({ public_status: "requested", public_message_id: answer.id }).eq("id", thread.id);
  await systemMessage(thread.id, `${profile.full_name} would like to post this question and the reply below on the public Q&A board, without your name. Only if you agree.`);
  notifyDoubtPublicRequest({ id: thread.id, subject: thread.subject, title: thread.title }, thread.student_id, profile.full_name);
  refresh(thread.id);
  return { ok: true };
}

export async function respondPublic(threadId: string, agree: boolean): Promise<ActionResult<{ questionId?: string }>> {
  const { profile } = await getCurrentProfile();
  if (profile?.role !== "student") return { ok: false, error: "Only the student who asked can decide." };
  const thread = await loadThread(threadId);
  if (!thread || thread.student_id !== profile.id) return { ok: false, error: "That doubt isn't available." };
  if (thread.public_status !== "requested" || !thread.public_message_id) return { ok: false, error: "There is nothing to approve right now." };

  const admin = createAdminClient();
  if (!agree) {
    await admin.from("doubt_threads").update({ public_status: "declined" }).eq("id", thread.id);
    await systemMessage(thread.id, "The student chose to keep this private.");
    refresh(thread.id);
    return { ok: true };
  }

  const [{ data: answerRow }, { data: firstRow }] = await Promise.all([
    admin.from("doubt_messages").select("*").eq("id", thread.public_message_id).maybeSingle(),
    admin.from("doubt_messages").select("body").eq("thread_id", thread.id).eq("sender", "student").order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const answer = answerRow as DoubtMessage | null;
  if (!answer?.author_id || !firstRow) return { ok: false, error: "Could not find the reply to share." };
  if (!(QA_SUBJECTS as readonly string[]).includes(thread.subject)) return { ok: false, error: "Unknown subject." };

  // Guarded: two taps on "Agree" must not publish twice.
  const { data: claimed } = await admin
    .from("doubt_threads")
    .update({ public_status: "published" })
    .eq("id", thread.id)
    .eq("public_status", "requested")
    .select("id");
  if (!claimed?.length) return { ok: true };

  const now = new Date().toISOString();
  const { data: question, error } = await admin
    .from("questions")
    .insert({
      author_id: thread.student_id,
      anonymous: true,
      subject: thread.subject,
      title: thread.title,
      body: firstRow.body as string,
      status: "answered",
      answered_at: now,
    })
    .select("id")
    .single();
  if (error || !question) {
    console.error("[respondPublic]", error?.message);
    await admin.from("doubt_threads").update({ public_status: "requested" }).eq("id", thread.id);
    return { ok: false, error: "Could not post it right now. Please try again." };
  }
  await admin.from("answers").insert({ question_id: question.id, author_id: answer.author_id, body: answer.body });
  await admin.from("doubt_threads").update({ public_question_id: question.id }).eq("id", thread.id);
  await systemMessage(thread.id, "Posted on the public Q&A board without your name. Thank you for helping others!");
  notifyDoubtPublished({ id: thread.id, subject: thread.subject, title: thread.title }, answer.author_id, question.id);
  refresh(thread.id);
  return { ok: true, questionId: question.id };
}

// ---------------------------------------------------------------------------
// Subject -> teacher mapping (warden / HOD)
// ---------------------------------------------------------------------------
const MappingSchema = z.object({
  teacherId: z.uuid(),
  subjects: z.array(z.enum(DOUBT_SUBJECTS as [string, ...string[]])).max(DOUBT_SUBJECTS.length),
});

export async function saveTeacherSubjects(input: z.input<typeof MappingSchema>): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile || !(SUBJECT_ADMIN_ROLES as readonly string[]).includes(profile.role)) return { ok: false, error: "Only the warden or HOD can change this." };
  const parsed = MappingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ subjects: [...new Set(parsed.data.subjects)] })
    .eq("id", parsed.data.teacherId)
    .eq("role", "teacher");
  if (error) {
    console.error("[saveTeacherSubjects]", error.message);
    return { ok: false, error: "Could not save. Please try again." };
  }
  revalidatePath("/subjects");
  refresh();
  return { ok: true };
}
