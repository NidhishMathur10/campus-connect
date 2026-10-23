"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ArrowBigUp,
  BadgeCheck,
  CheckCheck,
  EyeOff,
  Loader2,
  MessageSquarePlus,
  RotateCcw,
  Send,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { DraftResponse } from "@/app/api/ai/draft-answer/route";
import {
  approvePost,
  hidePost,
  markBestAnswer,
  postAnswer,
  postComment,
  toggleAnswerVote,
  toggleQuestionVote,
  unhidePost,
  type PostResult,
} from "@/lib/qa/actions";
import type { AnswerItem, QuestionDetail } from "@/lib/qa/queries";
import type { ActionResult } from "@/lib/tickets/actions";
import { cn } from "@/lib/utils";
import { moderationBlockReason } from "./moderation";
import { AuthorLine, BestAnswerBadge, HiddenNotice, PendingReviewBadge, SubjectBadge, TeacherBadge } from "./qa-bits";

type PostType = "question" | "answer" | "comment";

export interface QaViewerInfo {
  id: string;
  /** Teachers moderate (hide / approve), mark any best answer and get "Draft with AI". */
  isTeacher: boolean;
  /** Students and teachers may answer and comment. */
  canPost: boolean;
}

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<ActionResult>, success?: string) => {
    setBusy(key);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) toast.error(res.error);
        else {
          if (success) toast.success(success);
          router.refresh();
        }
      } finally {
        setBusy(null);
      }
    });
  };
  return { run, busy: pending ? busy : null };
}

function VoteButton({ count, voted, disabled, onClick, busy, label }: { count: number; voted: boolean; disabled?: boolean; onClick: () => void; busy: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-pressed={voted}
      aria-label={label}
      title={disabled ? "You can't upvote your own post" : label}
      className={cn(
        "flex w-12 shrink-0 flex-col items-center rounded-2xl border px-2 py-1.5 transition-colors disabled:cursor-not-allowed",
        voted ? "border-accent-blue bg-sky-tint-2 text-accent-blue" : "border-slate-200 bg-white text-slate-500 hover:border-accent-blue hover:text-accent-blue",
        disabled && "opacity-60 hover:border-slate-200 hover:text-slate-500",
      )}
    >
      {busy ? <Loader2 className="size-5 animate-spin" /> : <ArrowBigUp className={cn("size-5", voted && "fill-current")} />}
      <span className="text-sm font-extrabold">{count}</span>
    </button>
  );
}

/** Teacher-only: hide with a reason / restore / approve a "pending review" post. */
function ModerationTools({
  kind,
  id,
  hidden,
  pendingReview,
  run,
  busy,
}: {
  kind: PostType;
  id: string;
  hidden: boolean;
  pendingReview: boolean;
  run: ReturnType<typeof useRun>["run"];
  busy: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="flex flex-wrap gap-1.5">
      {pendingReview && !hidden && (
        <Button size="xs" variant="outline" onClick={() => run(`approve-${id}`, () => approvePost(kind, id), "Approved")} disabled={!!busy}>
          <CheckCheck /> Approve
        </Button>
      )}
      {hidden ? (
        <Button size="xs" variant="outline" onClick={() => run(`unhide-${id}`, () => unhidePost(kind, id), "Restored")} disabled={!!busy}>
          <RotateCcw /> Restore
        </Button>
      ) : (
        <Button size="xs" variant="ghost" className="text-slate-500 hover:text-red-700" onClick={() => setOpen(true)} disabled={!!busy}>
          <EyeOff /> Hide
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-extrabold text-navy">Hide this {kind}?</DialogTitle>
            <DialogDescription>Students won&apos;t see it any more. The author sees it greyed out with your reason.</DialogDescription>
          </DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason, e.g. Not respectful / Off-topic" maxLength={300} autoFocus />
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3 || busy === `hide-${id}`}
            onClick={() =>
              run(
                `hide-${id}`,
                async () => {
                  const res = await hidePost(kind, id, reason);
                  if (res.ok) setOpen(false);
                  return res;
                },
                "Hidden",
              )
            }
          >
            {busy === `hide-${id}` ? <Loader2 className="animate-spin" /> : <EyeOff />} Hide {kind}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Runs moderation first and shows a polite inline reason when a post is blocked. */
function usePoster() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: "checking" | "posting" | null; blocked: string | null }>({ busy: null, blocked: null });
  async function post(
    check: Parameters<typeof moderationBlockReason>[0],
    action: () => Promise<PostResult>,
    onDone: () => void,
  ) {
    setState({ busy: "checking", blocked: null });
    try {
      const reason = await moderationBlockReason(check);
      if (reason) return setState({ busy: null, blocked: reason });
      setState({ busy: "posting", blocked: null });
      const res = await action();
      if (!res.ok) {
        if ("blocked" in res) return setState({ busy: null, blocked: res.error });
        toast.error(res.error);
      } else {
        toast.success(res.pending_review ? "Posted — a teacher will review it shortly." : "Posted!");
        onDone();
        router.refresh();
      }
      setState({ busy: null, blocked: null });
    } catch {
      toast.error("Something went wrong. Please try again.");
      setState({ busy: null, blocked: null });
    }
  }
  return { ...state, post, clearBlocked: () => setState((s) => ({ ...s, blocked: null })) };
}

function BlockedNotice({ reason }: { reason: string }) {
  return (
    <div className="flex animate-fade-in items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <p>
        <span className="font-bold">We couldn&apos;t post this. </span>
        {reason}
      </p>
    </div>
  );
}

function CommentBox({ answerId, questionTitle }: { answerId: string; questionTitle: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const { busy, blocked, post } = usePoster();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-accent-blue">
        <MessageSquarePlus className="size-3.5" /> Add a comment
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length < 2) return;
        void post({ kind: "comment", text: text.trim(), context: questionTitle }, () => postComment(answerId, text), () => {
          setText("");
          setOpen(false);
        });
      }}
    >
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a comment…" maxLength={1000} autoFocus className="h-9 rounded-full" />
        <Button type="submit" size="sm" disabled={!!busy || text.trim().length < 2}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />}
        </Button>
      </div>
      {blocked && <BlockedNotice reason={blocked} />}
    </form>
  );
}

function AnswerCard({
  answer,
  detail,
  viewer,
  run,
  busy,
}: {
  answer: AnswerItem;
  detail: QuestionDetail;
  viewer: QaViewerInfo;
  run: ReturnType<typeof useRun>["run"];
  busy: string | null;
}) {
  const canMarkBest = (detail.is_mine || viewer.isTeacher) && !answer.hidden;
  const mine = answer.author_id === viewer.id;
  return (
    <li
      className={cn(
        "animate-slide-up rounded-3xl border bg-white p-4 shadow-sm sm:p-5",
        answer.is_best ? "border-emerald-300 ring-2 ring-emerald-100" : answer.is_teacher ? "border-violet-200" : "border-slate-200",
        answer.hidden && "opacity-70",
      )}
    >
      <div className="flex gap-3 sm:gap-4">
        <VoteButton
          count={answer.upvotes}
          voted={answer.voted}
          disabled={mine || answer.hidden}
          busy={busy === `vote-${answer.id}`}
          label="Upvote answer"
          onClick={() => run(`vote-${answer.id}`, () => toggleAnswerVote(answer.id))}
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {answer.is_best && <BestAnswerBadge />}
            {answer.is_teacher && !answer.is_best && <TeacherBadge />}
            {answer.pending_review && <PendingReviewBadge />}
          </div>
          {answer.hidden && <HiddenNotice reason={answer.hidden_reason} />}
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-800">{answer.body}</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AuthorLine author={answer.author} at={answer.created_at} />
            <div className="flex flex-wrap items-center gap-1.5">
              {canMarkBest && (
                <Button
                  size="xs"
                  variant={answer.is_best ? "outline" : "secondary"}
                  className={cn(!answer.is_best && "bg-emerald-50 text-emerald-800 hover:bg-emerald-100")}
                  disabled={!!busy}
                  onClick={() =>
                    run(`best-${answer.id}`, () => markBestAnswer(detail.question.id, answer.id), answer.is_best ? "Best answer removed" : "Marked as best answer")
                  }
                >
                  {busy === `best-${answer.id}` ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
                  {answer.is_best ? "Unmark best" : "Mark as best answer"}
                </Button>
              )}
              {viewer.isTeacher && (
                <ModerationTools kind="answer" id={answer.id} hidden={answer.hidden} pendingReview={answer.pending_review} run={run} busy={busy} />
              )}
            </div>
          </div>

          {(answer.comments.length > 0 || viewer.canPost) && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              {answer.comments.map((c) => (
                <div key={c.id} className={cn("rounded-2xl bg-slate-50 px-3 py-2", c.hidden && "opacity-70")}>
                  {c.hidden && <HiddenNotice reason={c.hidden_reason} className="mb-1.5 bg-white" />}
                  <p className="text-sm whitespace-pre-wrap text-slate-700">{c.body}</p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5">
                      <AuthorLine author={c.author} at={c.created_at} />
                      {c.pending_review && <PendingReviewBadge />}
                    </span>
                    {viewer.isTeacher && (
                      <ModerationTools kind="comment" id={c.id} hidden={c.hidden} pendingReview={c.pending_review} run={run} busy={busy} />
                    )}
                  </div>
                </div>
              ))}
              {viewer.canPost && !answer.hidden && <CommentBox answerId={answer.id} questionTitle={detail.question.title} />}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function AnswerBox({ detail, viewer }: { detail: QuestionDetail; viewer: QaViewerInfo }) {
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [fromAi, setFromAi] = useState(false);
  const { busy, blocked, post } = usePoster();

  async function draft() {
    setDrafting(true);
    try {
      const res = await fetch("/api/ai/draft-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: detail.question.id }),
      });
      const data = (await res.json()) as DraftResponse;
      if (!data.ok) return toast.error(data.error);
      setText(data.draft);
      setFromAi(true);
    } catch {
      toast.error("The AI couldn't write a draft right now — please type your answer.");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim().length < 2) return;
        void post({ kind: "answer", text: text.trim(), context: detail.question.title }, () => postAnswer(detail.question.id, text), () => {
          setText("");
          setFromAi(false);
        });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Your answer</p>
        {viewer.isTeacher && (
          <Button type="button" size="sm" variant="outline" onClick={draft} disabled={drafting || !!busy}>
            {drafting ? <Loader2 className="animate-spin" /> : <Sparkles className="text-accent-violet" />}
            {drafting ? "Drafting…" : text ? "Redraft with AI" : "Draft with AI"}
          </Button>
        )}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={viewer.isTeacher ? "Type your answer, or click “Draft with AI” and edit it." : "Share what you know — explain it simply."}
        className="min-h-40 text-[15px]"
        maxLength={5000}
      />
      {fromAi && (
        <p className="flex items-center gap-1.5 rounded-2xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">
          <Sparkles className="size-3.5" /> AI draft — please review and edit it. It will be posted under your name.
        </p>
      )}
      {blocked && <BlockedNotice reason={blocked} />}
      <Button type="submit" disabled={!!busy || drafting || text.trim().length < 2}>
        {busy ? <Loader2 className="animate-spin" /> : <Send />}
        {busy === "checking" ? "Checking…" : busy === "posting" ? "Posting…" : "Post answer"}
      </Button>
    </form>
  );
}

export function QuestionView({ detail, viewer }: { detail: QuestionDetail; viewer: QaViewerInfo }) {
  const { question: q, author, answers } = detail;
  const { run, busy } = useRun();
  const visibleAnswers = answers.filter((a) => !a.hidden).length;

  return (
    <div className="space-y-6">
      <article className={cn("animate-slide-up rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7", q.hidden && "opacity-80")}>
        <div className="flex gap-3 sm:gap-5">
          <VoteButton
            count={q.upvotes}
            voted={detail.voted}
            disabled={detail.is_mine || q.hidden}
            busy={busy === "vote-q"}
            label="Upvote question"
            onClick={() => run("vote-q", () => toggleQuestionVote(q.id))}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <SubjectBadge subject={q.subject} />
              {q.status === "answered" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  <BadgeCheck className="size-3" /> Answered
                </span>
              )}
              {q.pending_review && <PendingReviewBadge />}
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">{q.title}</h1>
            {q.hidden && <HiddenNotice reason={q.hidden_reason} />}
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700">{q.body}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AuthorLine author={author} at={q.created_at} />
              {viewer.isTeacher && (
                <ModerationTools kind="question" id={q.id} hidden={q.hidden} pendingReview={q.pending_review} run={run} busy={busy} />
              )}
            </div>
          </div>
        </div>
      </article>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-navy">
          {visibleAnswers} {visibleAnswers === 1 ? "answer" : "answers"}
          {detail.is_mine && answers.length > 0 && !q.best_answer_id && (
            <span className="text-xs font-semibold text-slate-500">— tap “Mark as best answer” on the one that helped</span>
          )}
        </h2>
        {answers.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">
            No answers yet. {viewer.isTeacher ? "Be the first to help." : "Teachers and classmates will see it soon."}
          </p>
        ) : (
          <ul className="space-y-3">
            {answers.map((a) => (
              <AnswerCard key={a.id} answer={a} detail={detail} viewer={viewer} run={run} busy={busy} />
            ))}
          </ul>
        )}
      </section>

      {viewer.canPost && !q.hidden && <AnswerBox detail={detail} viewer={viewer} />}
    </div>
  );
}
