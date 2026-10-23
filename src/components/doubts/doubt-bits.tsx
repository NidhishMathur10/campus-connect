import Link from "next/link";
import { Clock, MessageCircleQuestion } from "lucide-react";
import { SubjectBadge } from "@/components/qa/qa-bits";
import { DOUBT_REMINDER_HOURS, DOUBT_STATUS_LABELS, type DoubtStatus } from "@/config/subjects";
import type { DoubtListItem } from "@/lib/doubts/queries";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<DoubtStatus, string> = {
  open: "bg-warning-bg text-warning-fg border-warning-fg/30",
  answered: "bg-success-bg text-success-fg border-success-fg/30",
  closed: "bg-neutral-bg text-neutral-fg border-neutral-fg/30",
};

export function DoubtStatusBadge({ status, className }: { status: DoubtStatus; className?: string }) {
  return (
    <span className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_CLASS[status], className)}>
      {DOUBT_STATUS_LABELS[status]}
    </span>
  );
}

/** A list of doubts. `forTeacher` shows the student (name + roll number) and how long it has waited. */
export function DoubtList({ items, basePath, forTeacher = false }: { items: DoubtListItem[]; basePath: string; forTeacher?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((d) => {
        const waitingHours = d.waiting_hours;
        const overdue = d.status === "open" && waitingHours >= DOUBT_REMINDER_HOURS;
        return (
          <li key={d.id}>
            <Link
              href={`${basePath}/${d.id}`}
              className={cn(
                "flex animate-slide-up flex-col gap-2 rounded-3xl border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md",
                overdue ? "border-warning-fg/50" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <SubjectBadge subject={d.subject} />
                <DoubtStatusBadge status={d.status} />
                {overdue && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-bold text-warning-fg">
                    <Clock className="size-3" /> Waiting {Math.floor(waitingHours / 24)}d
                  </span>
                )}
                <span className="ml-auto text-xs text-text-muted">{timeAgo(d.last_message_at)}</span>
              </div>
              <h3 className="flex items-start gap-2 text-base leading-snug font-bold text-text">
                <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-text-muted" /> {d.title}
              </h3>
              <p className="line-clamp-2 text-sm text-text-muted">{d.last_preview}</p>
              <p className="text-xs text-text-muted">
                {forTeacher
                  ? d.student
                    ? `${d.student.name}${d.student.roll_no ? ` · roll ${d.student.roll_no}` : ""}`
                    : "Student"
                  : d.teachers.length > 0
                    ? `To ${d.teachers.join(" & ")}`
                    : "No teacher assigned"}
                {" · "}
                {d.message_count} {d.message_count === 1 ? "message" : "messages"}
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
