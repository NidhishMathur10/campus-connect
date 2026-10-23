"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCheck, Eye, EyeOff, Globe2, Loader2, Lock, Send, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { DoubtDraftResponse } from "@/app/api/doubts/draft/route";
import { SubjectBadge } from "@/components/qa/qa-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { closeDoubt, replyDoubt, requestPublic, respondPublic } from "@/lib/doubts/actions";
import type { ThreadView } from "@/lib/doubts/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DoubtStatusBadge } from "./doubt-bits";

/** One private doubt: the conversation, the reply box, and (for teachers) Draft with AI / Make public. */
export function DoubtThreadView({ view, qaBasePath }: { view: ThreadView; qaBasePath: string }) {
  const router = useRouter();
  const { thread, messages, student, teachers, as: role } = view;
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const closed = thread.status === "closed";
  const canReply = !closed && (role === "student" || role === "teacher");
  const sendBlocked = draft !== null && text.trim() === draft.trim() && !reviewed;

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBlocked(null);
    start(async () => {
      const res = await replyDoubt(thread.id, text);
      if (!res.ok) {
        if ("blocked" in res) setBlocked(res.error);
        else setError(res.error);
        return;
      }
      setText("");
      setDraft(null);
      setReviewed(false);
      router.refresh();
    });
  }

  async function draftWithAi() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/doubts/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id }),
      });
      const data = (await res.json()) as DoubtDraftResponse;
      if (!data.ok) return setError(data.error);
      setText(data.draft);
      setDraft(data.draft);
      setReviewed(false);
    } catch {
      setError("The AI couldn't write a draft right now — please type your reply.");
    } finally {
      setDrafting(false);
    }
  }

  function run(key: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusyId(key);
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(res.error ?? "Something went wrong.");
      setBusyId(null);
    });
  }

  const canMakePublic = role === "teacher" && (thread.public_status === "none" || thread.public_status === "declined");
  const publicAnswer = view.publicMessage;
  const firstStudent = messages.find((m) => m.sender === "student");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <SubjectBadge subject={thread.subject} />
          <DoubtStatusBadge status={thread.status} />
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text-muted">
            <Lock className="size-3" /> Private
          </span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{thread.title}</h1>
        <p className="text-sm text-text-muted">
          {role === "student"
            ? teachers.length > 0 ? `Between you and ${teachers.join(" & ")}` : "No teacher is assigned to this subject right now"
            : `From ${student?.name ?? "a student"}${student?.roll_no ? ` · roll ${student.roll_no}` : ""} · asked ${formatDateTime(thread.created_at)}`}
        </p>
        {role === "hod" && (
          <p className="flex items-center gap-2 rounded-2xl bg-surface-accent p-3 text-sm text-text-muted"><Eye className="size-4" /> You can read this doubt. Only the subject&apos;s teachers reply.</p>
        )}
      </div>

      {thread.photo_url && (
        <div className="animate-slide-up">
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase public URL */}
          <img src={thread.photo_url} alt="Photo attached to the doubt" className="max-h-80 rounded-3xl border border-border object-contain" />
        </div>
      )}

      <ol className="space-y-3" aria-label="Conversation">
        {messages.map((m) => {
          if (m.sender === "system") {
            return (
              <li key={m.id} className="text-center text-xs font-semibold text-text-muted">{m.body}</li>
            );
          }
          const mine = (m.sender === "student" && role === "student") || (m.sender === "teacher" && role === "teacher");
          const isPublic = thread.public_message_id === m.id;
          return (
            <li key={m.id} className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[92%] rounded-3xl px-4 py-3 text-sm whitespace-pre-wrap sm:max-w-[80%]",
                  m.sender === "teacher" ? "bg-surface-inverse text-text-inverse" : "border border-border bg-surface text-text",
                )}
              >
                {m.body}
              </div>
              <p className="flex flex-wrap items-center gap-2 px-2 text-xs text-text-muted">
                <span className="font-semibold">{m.sender === "teacher" ? (m.author_name ?? "Teacher") : role === "student" ? "You" : (student?.name ?? "Student")}</span>
                <span>{formatDateTime(m.created_at)}</span>
                {m.pending_review && <span className="rounded-full bg-warning-bg px-2 py-0.5 font-bold text-warning-fg">Not moderated</span>}
                {isPublic && thread.public_status !== "none" && <span className="rounded-full bg-info-bg px-2 py-0.5 font-bold text-info-fg">Proposed for the Q&amp;A board</span>}
                {canMakePublic && m.sender === "teacher" && m.author_id && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline disabled:opacity-60"
                    disabled={pending}
                    onClick={() => run(m.id, () => requestPublic(thread.id, m.id), "Asked the student for permission")}
                  >
                    {busyId === m.id ? <Loader2 className="size-3 animate-spin" /> : <Globe2 className="size-3" />} Make public
                  </button>
                )}
              </p>
            </li>
          );
        })}
      </ol>

      {/* The student decides whether the doubt + answer go on the public board (without their name). */}
      {thread.public_status === "requested" && role === "student" && publicAnswer && firstStudent && (
        <section className="animate-slide-up space-y-3 rounded-3xl border border-violet-fg/40 bg-violet-bg p-5 text-violet-fg">
          <p className="flex items-center gap-2 font-extrabold"><Globe2 className="size-5" /> Share this on the public Q&amp;A board?</p>
          <p className="text-sm">Your teacher thinks this could help others. It would be posted <strong>without your name</strong>, with this question and this answer. Your photo and the rest of the chat stay private.</p>
          <div className="space-y-2 rounded-2xl bg-surface p-4 text-sm text-text">
            <p className="font-bold">{thread.title}</p>
            <p className="whitespace-pre-wrap text-text-muted">{firstStudent.body}</p>
            <p className="eyebrow pt-1">Answer by {publicAnswer.author_name ?? "your teacher"}</p>
            <p className="whitespace-pre-wrap">{publicAnswer.body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => run("agree", () => respondPublic(thread.id, true), "Posted anonymously. Thank you!")}>
              {busyId === "agree" ? <Loader2 className="animate-spin" /> : <Globe2 />} Yes, post it anonymously
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => run("decline", () => respondPublic(thread.id, false), "Kept private")}>
              <EyeOff /> No, keep it private
            </Button>
          </div>
        </section>
      )}
      {thread.public_status === "requested" && role !== "student" && (
        <p className="rounded-2xl border border-border bg-surface-accent p-3 text-sm text-text-muted">Waiting for the student to agree to post this on the Q&amp;A board.</p>
      )}
      {thread.public_status === "published" && thread.public_question_id && (
        <p className="flex flex-wrap items-center gap-2 rounded-2xl border border-info-fg/30 bg-info-bg p-3 text-sm font-semibold text-info-fg">
          <Globe2 className="size-4" /> Posted on the public Q&amp;A board without the student&apos;s name.
          <Link href={`${qaBasePath}/${thread.public_question_id}`} className="underline">View it</Link>
        </p>
      )}

      {canReply && (
        <form onSubmit={send} className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <label htmlFor="reply" className="eyebrow">{role === "teacher" ? "Your reply" : "Add a follow-up"}</label>
          <Textarea
            id="reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={role === "teacher" ? "Explain it simply, with a small example…" : "Still stuck? Tell your teacher what you did not understand."}
            className="min-h-28 text-base"
            maxLength={4000}
            disabled={pending}
          />
          {draft !== null && (
            <div className="space-y-2 rounded-2xl border border-violet-fg/40 bg-violet-bg p-3 text-sm text-violet-fg">
              <p className="flex items-center gap-2 font-bold"><Sparkles className="size-4" /> AI draft — read it, correct it, then send. Students rely on your answer.</p>
              {sendBlocked && (
                <label className="flex items-center gap-2 font-semibold">
                  <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} className="size-4 accent-primary" />
                  I have read this draft and it is correct
                </label>
              )}
            </div>
          )}
          {blocked && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {blocked}
            </p>
          )}
          {error && <p role="alert" className="text-sm font-semibold text-danger-fg">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending || text.trim().length < 2 || sendBlocked}>
              {pending && busyId === null ? <Loader2 className="animate-spin" /> : <Send />} Send
            </Button>
            {role === "teacher" && (
              <Button type="button" variant="outline" onClick={draftWithAi} disabled={pending || drafting}>
                {drafting ? <Loader2 className="animate-spin" /> : <Sparkles />} {drafting ? "Drafting…" : "Draft with AI"}
              </Button>
            )}
            <Button type="button" variant="ghost" className="ml-auto" disabled={pending} onClick={() => run("close", () => closeDoubt(thread.id), "Doubt closed")}>
              <CheckCheck /> {role === "student" ? "Got it, close this doubt" : "Close doubt"}
            </Button>
          </div>
        </form>
      )}
      {closed && <p className="rounded-2xl border border-border bg-surface-2 p-3 text-center text-sm font-semibold text-text-muted">This doubt is closed.</p>}
    </div>
  );
}
