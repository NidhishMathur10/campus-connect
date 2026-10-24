"use client";

import Link from "next/link";
import { CalendarCheck, Lock, PauseCircle, RotateCcw, ShieldAlert, Timer, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getCategoryStyle } from "@/config/styles";
import { formatLocation } from "@/lib/format";
import type { JobTicket } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";
import { timeLeftWords, type Text } from "./i18n";
import { JobActions } from "./job-actions";
import { useJobs } from "./jobs-provider";

const STRIPE: Record<string, string> = {
  Urgent: "bg-prio-urgent-fg",
  High: "bg-prio-high-fg",
  Medium: "bg-prio-medium-fg",
  Low: "bg-prio-low-fg",
};

/** The biggest line of a card: building · floor · room or common area. */
export function jobLocation(job: JobTicket): string {
  return formatLocation(job);
}

export function TimeLeft({ job, className }: { job: JobTicket; className?: string }) {
  const { t, now } = useJobs();
  if (job.status === "Resolved" || job.status === "Closed") return null;
  if (job.sla_paused_at) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-base font-bold text-neutral-fg", className)}>
        <PauseCircle className="size-5" /> {t.paused}
      </span>
    );
  }
  const left = timeLeftWords(t, job.sla_due_at, now);
  if (!left) return null;
  return (
    <span
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1.5 text-base font-bold",
        left.late ? "text-danger-fg" : left.soon ? "text-warning-fg" : "text-text-muted",
        className,
      )}
    >
      {left.late ? <Timer className="size-5" /> : <CalendarCheck className="size-5" />} {left.text}
    </span>
  );
}

export function JobBadges({ job, t }: { job: JobTicket; t: Text }) {
  return (
    <>
      {job.priority === "Urgent" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-danger-solid px-3 py-1 text-sm font-bold text-danger-solid-fg">
          <ShieldAlert className="size-4" /> {t.urgent}
        </span>
      )}
      {job.status === "Reopened" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning-solid px-3 py-1 text-sm font-bold text-warning-solid-fg">
          <RotateCcw className="size-4" /> {t.reopened}
        </span>
      )}
      {job.affected >= 2 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-info-fg/30 bg-info-bg px-3 py-1 text-sm font-bold text-info-fg">
          <Users className="size-4" /> {t.affected(job.affected)}
        </span>
      )}
    </>
  );
}

export function useJobTitle(job: JobTicket): string {
  const { lang, t, hindiTitle } = useJobs();
  if (job.confidential) return t.confidentialCase;
  if (lang === "hi") return hindiTitle(job) ?? job.title ?? t.noTitle;
  return job.title ?? t.noTitle;
}

export function PhotoThumb({ url, size = "size-20" }: { url: string; size?: string }) {
  const { t } = useJobs();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t.enlargePhoto}
          className={cn("shrink-0 overflow-hidden rounded-2xl border border-border focus-visible:ring-3 focus-visible:ring-ring/50", size)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL */}
          <img src={url} alt="" className="size-full object-cover" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl p-2">
        <DialogTitle className="sr-only">{t.photo}</DialogTitle>
        <DialogDescription className="sr-only">{t.enlargePhoto}</DialogDescription>
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL */}
        <img src={url} alt="" className="max-h-[80dvh] w-full rounded-xl object-contain" />
      </DialogContent>
    </Dialog>
  );
}

export function JobCard({ job, showActions }: { job: JobTicket; showActions: boolean }) {
  const { t } = useJobs();
  const title = useJobTitle(job);
  const { icon: CategoryIcon, className: categoryClass } = getCategoryStyle(job.category);
  const hasBadges = job.priority === "Urgent" || job.status === "Reopened" || job.affected >= 2;

  return (
    <article className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-float">
      <span className={cn("absolute inset-y-0 left-0 w-2.5", STRIPE[job.priority] ?? STRIPE.Low)} aria-hidden />
      <div className="space-y-4 p-4 pl-6 sm:p-5 sm:pl-7">
        <div className="flex items-start gap-3">
          <Link href={`/jobs/${job.ticket_no}`} className="min-w-0 flex-1 space-y-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={cn("grid size-9 place-items-center rounded-xl border", categoryClass)} title={job.category}>
                <CategoryIcon className="size-5" />
              </span>
              <TimeLeft job={job} />
            </div>
            <h2 className="text-2xl leading-tight font-extrabold break-words text-text">
              {job.confidential && <Lock className="mr-1.5 inline size-5 align-[-2px]" />}
              {jobLocation(job)}
            </h2>
            <p className="text-lg leading-snug text-text-muted">{title}</p>
          </Link>
          {job.photo_url && <PhotoThumb url={job.photo_url} />}
        </div>

        {hasBadges && (
          <div className="flex flex-wrap gap-2">
            <JobBadges job={job} t={t} />
          </div>
        )}

        {showActions && <JobActions job={job} />}
      </div>
    </article>
  );
}
