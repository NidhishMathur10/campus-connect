import Link from "next/link";
import { ArrowBigUp, MessageSquare } from "lucide-react";
import type { QuestionListItem } from "@/lib/qa/queries";
import { cn } from "@/lib/utils";
import { AuthorLine, PendingReviewBadge, SubjectBadge, TeacherAnsweredBadge } from "./qa-bits";

export function QuestionCard({ question: q, href }: { question: QuestionListItem; href: string }) {
  return (
    <div
      className={cn(
        "group relative flex animate-slide-up gap-4 rounded-3xl border border-border bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md sm:p-5",
        q.hidden && "opacity-60",
      )}
    >
      <div className="flex w-12 shrink-0 flex-col items-center gap-2 text-center">
        <span className={cn("flex flex-col items-center rounded-2xl px-2 py-1", q.voted ? "bg-surface-accent-2 text-accent-text" : "text-text-muted")}>
          <ArrowBigUp className={cn("size-5", q.voted && "fill-current")} />
          <span className="text-sm font-extrabold">{q.upvotes}</span>
        </span>
        <span className={cn("flex flex-col items-center text-xs font-semibold", q.answer_count ? "text-success-fg" : "text-text-muted")}>
          <MessageSquare className="size-4" />
          {q.answer_count}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SubjectBadge subject={q.subject} />
          {q.teacher_answered && <TeacherAnsweredBadge />}
          {q.pending_review && <PendingReviewBadge />}
          {q.hidden && <span className="text-xs font-semibold text-text-muted">Hidden</span>}
          {q.is_mine && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-fg">You asked</span>}
        </div>
        <h3 className="font-bold text-text group-hover:text-accent-text">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-3xl">
            {q.title}
          </Link>
        </h3>
        <p className="line-clamp-2 text-sm text-text-muted">{q.body}</p>
        <AuthorLine author={q.author} at={q.created_at} />
      </div>
    </div>
  );
}
