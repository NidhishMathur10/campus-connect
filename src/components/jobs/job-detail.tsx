"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { ArrowLeft, Lock, MapPin, UserRound } from "lucide-react";
import type { ShellUser } from "@/components/shell/user-menu";
import { StatusBadge } from "@/components/common/badges";
import { getCategoryStyle } from "@/config/styles";
import type { TicketStatus } from "@/config/statuses";
import { formatDateTime } from "@/lib/format";
import type { JobTicket } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";
import { JobActions } from "./job-actions";
import { JobBadges, jobLocation, PhotoThumb, TimeLeft, useJobTitle } from "./job-card";
import { JobsHeader } from "./jobs-list";
import { useJobs } from "./jobs-provider";

export interface JobEvent {
  id: string;
  at: string;
  who: string | null;
  toStatus: TicketStatus | null;
  type: string;
  note: string | null;
}

/** The simple detail page: big photo, what happened, where, the student's room, the timeline and the three buttons. */
export function JobDetailView({
  job,
  mine,
  description,
  original,
  afterPhoto,
  reporter,
  events,
  user,
  userId,
}: {
  job: JobTicket;
  mine: boolean;
  description: string | null;
  original: string | null;
  afterPhoto: string | null;
  reporter: { name: string; room: string | null } | null;
  events: JobEvent[];
  user: ShellUser;
  userId: string;
}) {
  const { t, applyPatch, onServerData, lang, hindiTitle, requestHindi } = useJobs();
  useEffect(() => onServerData(), [job, events, onServerData]);
  useEffect(() => {
    if (lang === "hi") requestHindi([job]);
  }, [lang, job, requestHindi]);

  const current = useMemo(() => applyPatch(job) ?? job, [applyPatch, job]);
  const title = useJobTitle({ ...current, title_hi: hindiTitle(current) });
  const { icon: CategoryIcon, className: categoryClass } = getCategoryStyle(current.category);
  const open = ["Assigned", "In Progress", "Reopened"].includes(current.status);

  return (
    <>
      <JobsHeader user={user} userId={userId} />

      <Link href="/jobs" className="mb-4 inline-flex h-11 items-center gap-1.5 text-base font-bold text-text-muted hover:text-text">
        <ArrowLeft className="size-5" /> {t.back}
      </Link>

      <div className="space-y-4">
        {current.photo_url && (
          <div className="overflow-hidden rounded-3xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL */}
            <img src={current.photo_url} alt="" className="max-h-80 w-full object-cover" />
          </div>
        )}

        <section className="space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-float">
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("grid size-10 place-items-center rounded-xl border", categoryClass)} title={current.category}>
              <CategoryIcon className="size-5" />
            </span>
            <StatusBadge status={current.status} className="px-3 py-1 text-sm" />
            <TimeLeft job={current} />
          </div>
          <h1 className="text-3xl leading-tight font-extrabold break-words text-text">
            {current.confidential && <Lock className="mr-1.5 inline size-6 align-[-2px]" />}
            {title}
          </h1>
          <div className="flex flex-wrap gap-2">
            <JobBadges job={current} t={t} />
          </div>
          <p className="flex items-start gap-2 text-xl font-bold text-text">
            <MapPin className="mt-1 size-5 shrink-0 text-text-muted" /> {jobLocation(current)}
          </p>
          <p className="text-sm font-semibold text-text-muted">{current.ticket_no}</p>
        </section>

        {current.confidential ? (
          <section className="space-y-3 rounded-3xl border border-border bg-surface-2 p-5">
            <p className="flex items-start gap-2 text-lg text-text">
              <Lock className="mt-1 size-5 shrink-0" /> {t.confidentialDetail}
            </p>
            <Link
              href={`/staff?t=${current.ticket_no}`}
              className="inline-flex h-12 items-center rounded-full bg-primary px-5 text-base font-bold text-primary-fg"
            >
              {t.openAdvanced}
            </Link>
          </section>
        ) : (
          <>
            {description && (
              <section className="space-y-2 rounded-3xl border border-border bg-surface p-5">
                <p className="eyebrow">{t.whatHappened}</p>
                <p className="text-lg whitespace-pre-wrap text-text">{description}</p>
                {original && (
                  <>
                    <p className="eyebrow pt-2">{t.originalText}</p>
                    <p className="text-lg whitespace-pre-wrap text-text-muted">{original}</p>
                  </>
                )}
              </section>
            )}

            {reporter && (
              <section className="space-y-1 rounded-3xl border border-border bg-surface p-5">
                <p className="eyebrow">{t.studentRoom}</p>
                <p className="flex items-center gap-2 text-lg font-bold text-text">
                  <UserRound className="size-5 text-text-muted" /> {reporter.name}
                </p>
                {reporter.room && <p className="pl-7 text-lg text-text-muted">{reporter.room}</p>}
              </section>
            )}

            {afterPhoto && (
              <section className="space-y-2 rounded-3xl border border-border bg-surface p-5">
                <p className="eyebrow">{t.afterPhoto}</p>
                <PhotoThumb url={afterPhoto} size="h-40 w-full sm:w-64" />
              </section>
            )}
          </>
        )}

        <section className="space-y-3 rounded-3xl border border-border bg-surface p-5">
          <p className="eyebrow">{t.history}</p>
          {events.length === 0 ? (
            <p className="text-base text-text-muted">{t.noHistory}</p>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-border pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute top-1.5 -left-[1.6rem] size-3 rounded-full border-2 border-surface bg-primary" />
                  <p className="text-base font-bold text-text">
                    {e.type === "status_change" && e.toStatus ? e.toStatus : e.type === "created" ? "Reported" : e.type === "reopened" ? "Reopened" : "Note"}
                  </p>
                  {e.note && <p className="text-base text-text-muted">{e.note}</p>}
                  <p suppressHydrationWarning className="text-sm text-text-muted">
                    {formatDateTime(e.at)}
                    {e.who ? ` · ${e.who}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        {mine && open ? (
          <div className="sticky bottom-3 z-10 rounded-3xl border border-border bg-surface/95 p-3 shadow-float backdrop-blur">
            <JobActions job={current} />
          </div>
        ) : (
          !mine && <p className="rounded-2xl bg-surface-2 p-4 text-base text-text-muted">{t.notYours}</p>
        )}
      </div>
    </>
  );
}
