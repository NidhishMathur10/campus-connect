import Link from "next/link";
import { ChevronRight, Clock, Copy, GitMerge, Hourglass, MapPin, Star, Users } from "lucide-react";
import { CategoryBadge, ConfidentialBadge, EscalatedBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { formatLocation, timeAgo } from "@/lib/format";
import type { MyTicket } from "@/lib/tickets/queries";

export function Stars({ rating, className = "size-4" }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </span>
  );
}

export function TicketCard({ ticket }: { ticket: MyTicket }) {
  return (
    // The title link is stretched over the whole card, so the "Merged into" link can sit on top.
    <div className="group relative flex animate-slide-up flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs font-bold text-accent-blue">{ticket.ticket_no}</p>
          <h3 className="font-bold text-navy group-hover:text-accent-blue">
            <Link href={`/tickets/${ticket.ticket_no}`} className="after:absolute after:inset-0 after:rounded-3xl">
              {ticket.title}
            </Link>
          </h3>
        </div>
        <StatusBadge status={ticket.status} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <CategoryBadge category={ticket.category} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.escalated && <EscalatedBadge />}
        {ticket.is_confidential && <ConfidentialBadge />}
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

      {ticket.status === "Resolved" && !ticket.following && (
        <p className="flex items-center gap-1.5 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
          <Hourglass className="size-3.5" /> Staff marked this fixed — open it to confirm or reopen
        </p>
      )}
      {ticket.status === "Closed" && (
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
          {ticket.rating ? (
            <>
              <Stars rating={ticket.rating} /> {ticket.feedback && <span className="truncate">“{ticket.feedback}”</span>}
            </>
          ) : (
            "Closed — fix confirmed"
          )}
        </p>
      )}
      {ticket.status === "Merged" && ticket.merged_into && (
        <Link
          href={`/tickets/${ticket.merged_into}`}
          className="relative z-10 flex w-fit items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-sky-tint hover:text-accent-blue"
        >
          <GitMerge className="size-3.5" /> Merged into {ticket.merged_into} →
        </Link>
      )}

      <div className="flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
        <span className="flex min-w-0 items-center gap-1 truncate">
          <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{formatLocation(ticket)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Clock className="size-3.5" /> {timeAgo(ticket.created_at)}
          <ChevronRight className="size-4 text-slate-300 group-hover:text-accent-blue" />
        </span>
      </div>
    </div>
  );
}
