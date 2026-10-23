import Link from "next/link";
import { Clock, MapPin, Repeat, RotateCcw, ShieldAlert, Siren, Timer, Users, type LucideIcon } from "lucide-react";
import { ESCALATION_REASON_LABELS } from "@/config/statuses";
import type { EscalationListItem } from "@/lib/escalation-queries";
import { timeAgo } from "@/lib/format";
import type { EscalationReason, EscalationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const REASON_STYLES: Record<EscalationReason, { icon: LucideIcon; className: string }> = {
  recurring: { icon: Repeat, className: "bg-violet-100 text-violet-800 border-violet-200" },
  reopened: { icon: RotateCcw, className: "bg-rose-100 text-rose-800 border-rose-200" },
  sla_breach: { icon: Timer, className: "bg-red-600 text-white border-red-600" },
  manual: { icon: ShieldAlert, className: "bg-slate-800 text-white border-slate-800" },
};

const STATUS_STYLES: Record<EscalationStatus, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-200",
  acknowledged: "bg-blue-50 text-blue-700 border-blue-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
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
        "group flex animate-slide-up flex-col gap-3 rounded-3xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md",
        e.status === "open" ? "border-red-200" : "border-slate-200",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ReasonBadge reason={e.reason} />
        <EscalationStatusBadge status={e.status} />
      </div>
      <h3 className="text-lg leading-snug font-extrabold text-navy group-hover:text-accent-blue">
        {e.headline ?? e.where}
      </h3>
      {e.brief && e.brief_model ? (
        <p className="line-clamp-2 text-sm text-slate-600">{e.brief}</p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-slate-400"><Siren className="size-4 animate-pulse" /> AI brief being written…</p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-1"><MapPin className="size-3.5" /> {e.where}</span>
        <span className="flex items-center gap-1"><Users className="size-3.5" /> {e.affected_count} student{e.affected_count === 1 ? "" : "s"} affected</span>
        <span>{e.ticket_count} ticket{e.ticket_count === 1 ? "" : "s"} · {e.open_ticket_count} open</span>
        <span className="flex items-center gap-1"><Clock className="size-3.5" /> {timeAgo(e.created_at)}</span>
      </div>
    </Link>
  );
}
