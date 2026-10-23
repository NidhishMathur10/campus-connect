import Link from "next/link";
import { Clock, Lock, MapPin, Repeat, RotateCcw, ShieldAlert, Siren, Timer, Users, type LucideIcon } from "lucide-react";
import { ESCALATION_REASON_LABELS } from "@/config/statuses";
import type { EscalationListItem } from "@/lib/escalation-queries";
import { timeAgo } from "@/lib/format";
import type { EscalationReason, EscalationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const REASON_STYLES: Record<EscalationReason, { icon: LucideIcon; className: string }> = {
  recurring: { icon: Repeat, className: "bg-violet-bg text-violet-fg border-violet-fg/30" },
  reopened: { icon: RotateCcw, className: "bg-danger-bg text-danger-fg border-danger-fg/30" },
  sla_breach: { icon: Timer, className: "bg-danger-solid text-danger-solid-fg border-danger-solid" },
  manual: { icon: ShieldAlert, className: "bg-surface-inverse text-text-inverse border-surface-inverse" },
  safety: { icon: Lock, className: "bg-danger-solid text-danger-solid-fg border-danger-solid" },
};

const STATUS_STYLES: Record<EscalationStatus, string> = {
  open: "bg-warning-bg text-warning-fg border-warning-fg/30",
  acknowledged: "bg-info-bg text-info-fg border-info-fg/30",
  resolved: "bg-success-bg text-success-fg border-success-fg/30",
};

const pill = "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap";

export function ReasonBadge({ reason, className }: { reason: EscalationReason; className?: string }) {
  const { icon: Icon, className: style } = REASON_STYLES[reason];
  return (
    <span className={cn(pill, style, className)}>
      <Icon className="size-3" /> {ESCALATION_REASON_LABELS[reason]}
    </span>
  );
}

export function EscalationStatusBadge({ status }: { status: EscalationStatus }) {
  return <span className={cn(pill, "capitalize", STATUS_STYLES[status])}>{status}</span>;
}

export function EscalationCard({ e }: { e: EscalationListItem }) {
  return (
    <Link
      href={`/escalations/${e.id}`}
      className={cn(
        "group flex animate-slide-up flex-col gap-3 rounded-3xl border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md",
        e.status === "open" ? "border-danger-fg/30" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReasonBadge reason={e.reason} />
        <EscalationStatusBadge status={e.status} />
      </div>
      <h3 className="text-lg leading-snug font-extrabold text-text group-hover:text-accent-text">
        {e.headline ?? e.where}
      </h3>
      {e.brief && e.brief_model ? (
        <p className="line-clamp-2 text-sm text-text-muted">{e.brief}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-text-muted"><Siren className="size-4 animate-pulse" /> AI brief being written…</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-text-muted">
        <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {e.where}</span>
        <span className="flex items-center gap-1"><Users className="size-3.5" /> {e.affected_count} student{e.affected_count === 1 ? "" : "s"} affected</span>
        <span>{e.ticket_count} ticket{e.ticket_count === 1 ? "" : "s"} · {e.open_ticket_count} open</span>
        <span className="flex items-center gap-1"><Clock className="size-3.5" /> {timeAgo(e.created_at)}</span>
      </div>
    </Link>
  );
}
