import Link from "next/link";
import { ChevronRight, Clock, Copy, MapPin, Users } from "lucide-react";
import { CategoryBadge, EscalatedBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { formatLocation, timeAgo } from "@/lib/format";
import type { MyTicket } from "@/lib/tickets/queries";

export function TicketCard({ ticket }: { ticket: MyTicket }) {
  return (
    <Link
      href={`/tickets/${ticket.ticket_no}`}
      className="group flex animate-slide-up flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs font-bold text-accent-blue">{ticket.ticket_no}</p>
          <h3 className="font-bold text-navy group-hover:text-accent-blue">{ticket.title}</h3>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CategoryBadge category={ticket.category} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.escalated && <EscalatedBadge />}
        {ticket.duplicate_status === "flagged" && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            <Copy className="size-3" /> Possible duplicate
          </span>
        )}
        {ticket.following && (
          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-tint px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            <Users className="size-3" /> Following
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
        <span className="flex min-w-0 items-center gap-1 truncate">
          <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{formatLocation(ticket)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Clock className="size-3.5" /> {timeAgo(ticket.created_at)}
          <ChevronRight className="size-4 text-slate-300 group-hover:text-accent-blue" />
        </span>
      </div>
    </Link>
  );
}
