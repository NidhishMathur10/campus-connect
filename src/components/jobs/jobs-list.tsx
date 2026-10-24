"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Languages, LayoutDashboard } from "lucide-react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "@/components/shell/notification-bell";
import { UserMenu, type ShellUser } from "@/components/shell/user-menu";
import { Logo } from "@/components/brand/logo";
import type { JobsData, JobTicket } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";
import { JobCard } from "./job-card";
import { useJobs } from "./jobs-provider";

type Tab = "todo" | "working" | "done";

/** Overdue or Urgent first, then the nearest deadline. Waiting (paused) jobs are never "late". */
function sortJobs(jobs: JobTicket[], now: number): JobTicket[] {
  const hot = (j: JobTicket) =>
    j.priority === "Urgent" || (!j.sla_paused_at && !!j.sla_due_at && new Date(j.sla_due_at).getTime() < now);
  const due = (j: JobTicket) => (j.sla_due_at ? new Date(j.sla_due_at).getTime() : Number.POSITIVE_INFINITY);
  return [...jobs].sort((a, b) => Number(hot(b)) - Number(hot(a)) || due(a) - due(b));
}

export function JobsHeader({ user, userId, doneCount }: { user: ShellUser; userId: string; doneCount?: number }) {
  const { t, lang, setLang, now } = useJobs();
  const hour = new Date(now + 5.5 * 3600_000).getUTCHours();
  const greeting = hour < 12 ? t.goodMorning : hour < 17 ? t.goodAfternoon : t.goodEvening;
  const first = user.fullName.split(/\s+–\s+/)[0];

  return (
    <header className="mb-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/jobs" aria-label={t.myJobs}>
          <Logo />
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "hi" : "en")}
            aria-label={t.language}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-bold text-text hover:bg-surface-2"
          >
            <Languages className="size-4" />
            <span className={cn(lang === "en" ? "text-text" : "text-text-muted")}>English</span>
            <span className="text-text-muted">/</span>
            <span className={cn(lang === "hi" ? "text-text" : "text-text-muted")}>हिंदी</span>
          </button>
          <ThemeToggle variant="menu" />
          <NotificationBell userId={userId} />
          <UserMenu user={user} />
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{t.myJobs}</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-text">
            {greeting}, {first}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {doneCount != null && (
            <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-success-bg px-4 text-base font-bold text-success-fg">
              {t.doneToday}: {doneCount} <CheckCircle2 className="size-5" />
            </span>
          )}
          <Link
            href="/staff"
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-bold text-text hover:bg-surface-2"
          >
            <LayoutDashboard className="size-4" /> {t.advanced}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function JobsList({ data, user, userId }: { data: JobsData; user: ShellUser; userId: string }) {
  const { t, lang, now, applyPatch, onServerData, requestHindi } = useJobs();
  const [tab, setTab] = useState<Tab>("todo");

  // Fresh data from the server: forget the local "just did this" patches that have been saved.
  useEffect(() => onServerData(), [data, onServerData]);

  const { todo, working, done } = useMemo(() => {
    const active = data.active.map(applyPatch).filter((j): j is JobTicket => !!j);
    const finishedNow = active.filter((j) => j.status === "Resolved");
    const open = active.filter((j) => j.status !== "Resolved");
    const doneIds = new Set(data.doneToday.map((j) => j.id));
    return {
      todo: sortJobs(open.filter((j) => j.status === "Assigned" || j.status === "Reopened"), now),
      working: sortJobs(open.filter((j) => j.status === "In Progress"), now),
      done: [...finishedNow.filter((j) => !doneIds.has(j.id)), ...data.doneToday.map(applyPatch).filter((j): j is JobTicket => !!j)],
    };
  }, [data, applyPatch, now]);

  // Hindi titles are made once per ticket on the server, only when someone switches to हिंदी.
  useEffect(() => {
    if (lang === "hi") requestHindi([...todo, ...working]);
  }, [lang, todo, working, requestHindi]);

  const tabs: { id: Tab; label: string; jobs: JobTicket[] }[] = [
    { id: "todo", label: t.tabTodo, jobs: todo },
    { id: "working", label: t.tabWorking, jobs: working },
    { id: "done", label: t.tabDone, jobs: done },
  ];
  const current = tabs.find((x) => x.id === tab)!;
  const empty = { todo: t.emptyTodo, working: t.emptyWorking, done: t.emptyDone }[tab];

  return (
    <>
      <JobsHeader user={user} userId={userId} doneCount={done.length} />

      <div role="tablist" className="sticky top-2 z-20 mb-4 grid grid-cols-3 gap-1 rounded-full border border-border bg-surface/95 p-1 shadow-float backdrop-blur">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            type="button"
            onClick={() => setTab(x.id)}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-full text-base font-bold transition-colors",
              tab === x.id ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {x.label}
            <span
              className={cn(
                "grid min-w-6 place-items-center rounded-full px-1.5 text-sm",
                tab === x.id ? "bg-primary-fg/20" : "bg-surface-2",
              )}
            >
              {x.jobs.length}
            </span>
          </button>
        ))}
      </div>

      {current.jobs.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
          <ClipboardCheck className="size-10 text-text-muted" />
          <p className="text-lg font-semibold text-text-muted">{empty}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {current.jobs.map((job) => (
            <JobCard key={job.id} job={job} showActions={tab !== "done"} />
          ))}
        </div>
      )}
    </>
  );
}
