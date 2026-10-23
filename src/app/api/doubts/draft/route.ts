import { NextResponse } from "next/server";
import { z } from "zod";
import { draftAnswer } from "@/lib/ai/qa";
import { getCurrentProfile } from "@/lib/auth";
import { isTeacherOf, canAccessThread } from "@/lib/doubts/queries";
import type { DoubtThread } from "@/lib/doubts/types";
import { createAdminClient } from "@/lib/supabase/admin";

const BodySchema = z.object({ threadId: z.uuid() });

export type DoubtDraftResponse = { ok: true; draft: string } | { ok: false; error: string };

/**
 * POST /api/doubts/draft — "Draft with AI" for the subject's teacher. Returns text for the reply
 * box only; nothing is sent until the teacher reviews, edits and presses Send.
 */
export async function POST(request: Request) {
  const reply = (body: DoubtDraftResponse, status = 200) => NextResponse.json(body, { status });
  const { profile } = await getCurrentProfile();
  const viewer = profile ? { id: profile.id, role: profile.role, subjects: profile.subjects ?? [] } : null;
  if (!viewer) return reply({ ok: false, error: "Please log in again." }, 401);

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, error: "Unknown doubt." }, 400);

  const admin = createAdminClient();
  const { data } = await admin.from("doubt_threads").select("*").eq("id", parsed.data.threadId).maybeSingle();
  const thread = data as DoubtThread | null;
  if (!thread || !canAccessThread(thread, viewer) || !isTeacherOf(thread, viewer)) {
    return reply({ ok: false, error: "Only the subject's teacher can draft with AI." }, 403);
  }

  const { data: msgs } = await admin
    .from("doubt_messages")
    .select("sender, body")
    .eq("thread_id", thread.id)
    .neq("sender", "system")
    .order("created_at", { ascending: true });
  const student = (msgs ?? []).filter((m) => m.sender === "student").map((m) => m.body as string);
  const teacher = (msgs ?? []).filter((m) => m.sender === "teacher").map((m) => m.body as string);

  const res = await draftAnswer({
    subject: thread.subject,
    title: thread.title,
    // The latest student message is what needs answering; earlier ones give the context.
    body: student.map((s, i) => (i === student.length - 1 && student.length > 1 ? `LATEST MESSAGE: ${s}` : s)).join("\n\n"),
    existingAnswers: teacher,
  });
  if (!res.ok) {
    console.error("[api/doubts/draft]", res.error);
    return reply({ ok: false, error: "The AI couldn't write a draft right now — please type your reply." });
  }
  return reply({ ok: true, draft: res.data.answer.trim() });
}
