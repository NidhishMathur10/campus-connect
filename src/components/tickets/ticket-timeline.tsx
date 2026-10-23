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
import type { TicketEventType } from "@/config/statuses";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { TicketEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const EVENT_META: Record<TicketEventType, { icon: LucideIcon; color: string; label: (e: TicketEvent) => string }> = {
  created: { icon: FilePlus2, color: "bg-navy text-white", label: () => "Ticket submitted" },
  status_change: {
    icon: ArrowRightLeft,
    color: "bg-violet-100 text-violet-700",
    label: (e) => (e.to_status ? `Status → ${e.to_status}` : "Status changed"),
  },
  assigned: { icon: UserCheck, color: "bg-blue-100 text-blue-700", label: () => "Assigned" },
  note: { icon: MessageSquare, color: "bg-slate-100 text-slate-700", label: () => "Note from staff" },
  duplicate_flagged: { icon: Copy, color: "bg-amber-100 text-amber-700", label: () => "Flagged as possible duplicate" },
  merged: { icon: GitMerge, color: "bg-zinc-200 text-zinc-700", label: () => "Merged" },
  duplicate_dismissed: { icon: CheckCircle2, color: "bg-slate-100 text-slate-700", label: () => "Not a duplicate" },
  override: { icon: Wrench, color: "bg-slate-100 text-slate-700", label: () => "Details corrected by staff" },
  escalated: { icon: ShieldAlert, color: "bg-red-600 text-white", label: () => "Escalated" },
  reopened: { icon: RotateCcw, color: "bg-rose-100 text-rose-700", label: () => "Reopened — not fixed yet" },
  rating: { icon: Star, color: "bg-amber-100 text-amber-700", label: () => "Rated" },
  me_too: { icon: Users, color: "bg-sky-100 text-sky-700", label: () => "Another student has this problem" },
};

/** Vertical progress history built from ticket_events. */
export function TicketTimeline({ events }: { events: TicketEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No updates yet.</p>;
  }
  return (
    <ol className="relative space-y-5">
      <span className="absolute top-2 bottom-2 left-[15px] w-px bg-slate-200" aria-hidden />
      {events.map((e, i) => {
        const meta = EVENT_META[e.type] ?? EVENT_META.note;
        const Icon = meta.icon;
        const last = i === events.length - 1;
        return (
          <li key={e.id} className="relative flex animate-fade-in gap-3">
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-white",
                meta.color,
                last && "shadow-[0_0_0_6px_rgba(59,130,246,0.15)]",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="font-bold text-navy">{meta.label(e)}</p>
                <time className="text-xs text-slate-500" dateTime={e.created_at} title={formatDateTime(e.created_at)}>
                  {formatDateTime(e.created_at)} · {timeAgo(e.created_at)}
                </time>
              </div>
              <p className="text-xs font-medium text-slate-500">
                {e.actor_name ?? "CampusConnect"}
                {e.actor_role && ` · ${ROLE_LABELS[e.actor_role]}`}
              </p>
              {e.note && <p className="mt-1 text-sm text-slate-700">{e.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
