import { BadgeCheck, CheckCircle2, EyeOff, GraduationCap, Hourglass } from "lucide-react";
import { SUBJECT_STYLES, type QaSubject } from "@/config/qa";
import { timeAgo } from "@/lib/format";
import type { QaAuthor } from "@/lib/qa/queries";
import { cn } from "@/lib/utils";

const pill =
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function SubjectBadge({ subject, className }: { subject: string; className?: string }) {
  return <span className={cn(pill, SUBJECT_STYLES[subject as QaSubject] ?? SUBJECT_STYLES.Other, className)}>{subject}</span>;
}

export function TeacherBadge({ className }: { className?: string }) {
  return (
    <span className={cn(pill, "border-violet-fg/30 bg-violet-bg text-violet-fg", className)}>
      <GraduationCap className="size-3" /> Teacher
    </span>
  );
}

export function TeacherAnsweredBadge() {
  return (
    <span className={cn(pill, "border-success-fg/30 bg-success-bg text-success-fg")}>
      <CheckCircle2 className="size-3" /> Answered by teacher
    </span>
  );
}

export function BestAnswerBadge() {
  return (
    <span className={cn(pill, "border-success-solid bg-success-solid text-success-solid-fg")}>
      <BadgeCheck className="size-3" /> Best answer
    </span>
  );
}

export function PendingReviewBadge() {
  return (
    <span className={cn(pill, "border-warning-fg/30 bg-warning-bg text-warning-fg")} title="Automatic check was unavailable — a teacher will review it">
      <Hourglass className="size-3" /> Pending review
    </span>
  );
}

export function HiddenNotice({ reason, className }: { reason: string | null; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-xs font-semibold text-text-muted", className)}>
      <EyeOff className="mt-0.5 size-3.5 shrink-0" />
      <span>Hidden by a teacher{reason ? ` — ${reason}` : ""}. Only you and teachers can see this.</span>
    </p>
  );
}

/** "Aarav Mehta · 2616400101 · 3h ago" — roll number only reaches roles allowed to see it. */
export function AuthorLine({ author, at, className }: { author: QaAuthor; at: string; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-muted", className)}>
      <span className="font-semibold text-text">{author.name}</span>
      {author.roll_no && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text-muted">{author.roll_no}</span>}
      {author.role === "teacher" && <TeacherBadge className="px-2 py-0 text-[11px]" />}
      <span aria-hidden>·</span>
      <time dateTime={at} suppressHydrationWarning>
        {timeAgo(at)}
      </time>
    </p>
  );
}
