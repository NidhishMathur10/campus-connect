"use client";

import { useEffect, useState } from "react";
import { PauseCircle, Timer } from "lucide-react";
import { SLA_REMINDER_FRACTION } from "@/config/assignment";
import { OPEN_STATUSES, type TicketStatus } from "@/config/statuses";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Current time, ticking every 30s so ages and SLA countdowns stay fresh. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function duration(ms: number): string {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function isOverdue(t: { sla_due_at: string | null; status: TicketStatus; sla_paused_at?: string | null }, now: number): boolean {
  return !!t.sla_due_at && !t.sla_paused_at && OPEN_STATUSES.includes(t.status) && new Date(t.sla_due_at).getTime() < now;
}

/**
 * "5h 20m left" (grey) → amber once 75% of the SLA window is used → "Overdue 2h 5m" (red).
 * "SLA paused" while the ticket waits for parts. Hidden once the ticket is resolved.
 */
export function SlaCountdown({
  dueAt,
  startAt,
  pausedAt,
  status,
  now,
  className,
}: {
  dueAt: string | null;
  /** Start of the current SLA window (sla_started_at, or created_at). */
  startAt?: string | null;
  pausedAt?: string | null;
  status: TicketStatus;
  now: number;
  className?: string;
}) {
  if (!dueAt || !OPEN_STATUSES.includes(status)) return null;
  if (pausedAt) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap text-neutral-fg", className)} title="Waiting for parts / external dependency — the SLA timer is paused">
        <PauseCircle className="size-3.5" />
        SLA paused
      </span>
    );
  }
  const due = new Date(dueAt).getTime();
  const left = due - now;
  const overdue = left < 0;
  const start = startAt ? new Date(startAt).getTime() : null;
  const soon = !overdue && start != null && due > start && now >= start + SLA_REMINDER_FRACTION * (due - start);
  return (
    <span
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap",
        overdue ? "text-danger-fg" : soon ? "text-warning-fg" : "text-text-muted",
        className,
      )}
      title={`SLA due ${new Date(dueAt).toLocaleString("en-IN")}`}
    >
      <Timer className="size-3.5" />
      {overdue ? `Overdue ${duration(left)}` : `${duration(left)} left`}
    </span>
  );
}

export function Age({ iso, now, className }: { iso: string; now: number; className?: string }) {
  return (
    <span suppressHydrationWarning className={className}>
      {timeAgo(iso, now)}
    </span>
  );
}
