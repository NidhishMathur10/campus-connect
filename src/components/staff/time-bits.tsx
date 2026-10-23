"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
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

export function isOverdue(t: { sla_due_at: string | null; status: TicketStatus }, now: number): boolean {
  return !!t.sla_due_at && OPEN_STATUSES.includes(t.status) && new Date(t.sla_due_at).getTime() < now;
}

/** "5h 20m left" / "Overdue 2h 5m" (red). Hidden once the ticket is resolved. */
export function SlaCountdown({
  dueAt,
  status,
  now,
  className,
}: {
  dueAt: string | null;
  status: TicketStatus;
  now: number;
  className?: string;
}) {
  if (!dueAt || !OPEN_STATUSES.includes(status)) return null;
  const left = new Date(dueAt).getTime() - now;
  const overdue = left < 0;
  const soon = !overdue && left < 2 * 3600_000;
  return (
    <span
      suppressHydrationWarning
      className={cn(
        "inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap",
        overdue ? "text-red-600" : soon ? "text-orange-600" : "text-slate-500",
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
