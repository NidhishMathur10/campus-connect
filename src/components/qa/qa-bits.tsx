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
    <span className={cn(pill, "border-violet-200 bg-violet-50 text-violet-700", className)}>
      <GraduationCap className="size-3" /> Teacher
    </span>
  );
}

export function TeacherAnsweredBadge() {
  return (
    <span className={cn(pill, "border-emerald-200 bg-emerald-50 text-emerald-700")}>
      <CheckCircle2 className="size-3" /> Answered by teacher
    </span>
  );
}

export function BestAnswerBadge() {
  return (
    <span className={cn(pill, "border-emerald-600 bg-emerald-600 text-white")}>
      <BadgeCheck className="size-3" /> Best answer
    </span>
  );
}

export function PendingReviewBadge() {
  return (
    <span className={cn(pill, "border-amber-200 bg-amber-50 text-amber-800")} title="Automatic check was unavailable — a teacher will review it">
      <Hourglass className="size-3" /> Pending review
    </span>
  );
}

export function HiddenNotice({ reason, className }: { reason: string | null; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600", className)}>
      <EyeOff className="mt-0.5 size-3.5 shrink-0" />
      <span>Hidden by a teacher{reason ? ` — ${reason}` : ""}. Only you and teachers can see this.</span>
    </p>
  );
}

/** "Aarav Mehta · 2616400101 · 3h ago" — roll number only reaches roles allowed to see it. */
export function AuthorLine({ author, at, className }: { author: QaAuthor; at: string; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500", className)}>
      <span className="font-semibold text-slate-700">{author.name}</span>
      {author.roll_no && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">{author.roll_no}</span>}
      {author.role === "teacher" && <TeacherBadge className="px-2 py-0 text-[11px]" />}
      <span aria-hidden>·</span>
      <time dateTime={at} suppressHydrationWarning>
        {timeAgo(at)}
      </time>
    </p>
  );
}
