import {
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  FilePlus2,
  GitMerge,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  Star,
  UserCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { ROLE_LABELS } from "@/config/roles";
import { INTERNAL_EVENT_TYPES, type TicketEventType } from "@/config/statuses";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { TicketEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const EVENT_META: Record<TicketEventType, { icon: LucideIcon; color: string; label: (e: TicketEvent) => string }> = {
  created: { icon: FilePlus2, color: "bg-primary text-primary-fg", label: () => "Ticket submitted" },
  status_change: {
    icon: ArrowRightLeft,
    color: "bg-violet-bg text-violet-fg",
    label: (e) => (e.to_status ? `Status → ${e.to_status}` : "Status changed"),
  },
  assigned: { icon: UserCheck, color: "bg-info-bg text-info-fg", label: () => "Assigned" },
  note: {
    icon: MessageSquare,
    color: "bg-surface-2 text-text",
    label: (e) =>
      e.is_internal
        ? "Internal note"
        : e.actor_role === "dean"
          ? "Directive from the Dean"
          : e.actor_role === "hod"
            ? "Directive from the HOD"
            : e.actor_role === "student"
              ? "Note"
              : "Note from staff",
  },
  duplicate_flagged: { icon: Copy, color: "bg-warning-bg text-warning-fg", label: () => "Flagged as possible duplicate" },
  merged: {
    icon: GitMerge,
    color: "bg-neutral-bg text-neutral-fg",
    label: (e) => (e.to_status === "Merged" ? "Merged into another ticket" : "Duplicate merged in"),
  },
  duplicate_dismissed: { icon: CheckCircle2, color: "bg-surface-2 text-text", label: () => "Not a duplicate" },
  override: { icon: Wrench, color: "bg-surface-2 text-text", label: () => "Details corrected by staff" },
  escalated: { icon: ShieldAlert, color: "bg-danger-solid text-danger-solid-fg", label: () => "Escalated" },
  reopened: { icon: RotateCcw, color: "bg-danger-bg text-danger-fg", label: () => "Reopened — not fixed yet" },
  rating: { icon: Star, color: "bg-warning-bg text-warning-fg", label: () => "Rated" },
  me_too: { icon: Users, color: "bg-info-bg text-info-fg", label: () => "Another student has this problem" },
};

/** Vertical progress history built from ticket_events. */
export function TicketTimeline({ events }: { events: TicketEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-text-muted">No updates yet.</p>;
  }
  return (
    <ol className="relative space-y-5">
      <span className="fx-line absolute top-2 bottom-2 left-[15px] w-px bg-border" aria-hidden />
      {events.map((e, i) => {
        const meta = EVENT_META[e.type] ?? EVENT_META.note;
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="fx-step relative flex gap-3" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
            {last && <span className="fx-dot-pulse absolute top-0 left-0 size-8 rounded-full bg-accent-blue" aria-hidden="true" />}
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-surface",
                meta.color,
                last && "shadow-glow",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="flex items-center gap-2 font-bold text-text">
                  {meta.label(e)}
                  {(e.is_internal || INTERNAL_EVENT_TYPES.includes(e.type)) && (
                    <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[10px] font-bold tracking-wider text-warning-fg uppercase">
                      Staff only
                    </span>
                  )}
                </p>
                <time className="text-xs text-text-muted" dateTime={e.created_at} title={formatDateTime(e.created_at)}>
                  {formatDateTime(e.created_at)} · {timeAgo(e.created_at)}
                </time>
              </div>
              <p className="text-xs font-medium text-text-muted">
                {e.actor_name ?? "CampusConnect"}
                {e.actor_role && ` · ${ROLE_LABELS[e.actor_role]}`}
              </p>
              {e.note && <p className="mt-1 text-sm text-text">{e.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
