import Link from "next/link";
import { ChevronRight, Clock, Copy, GitMerge, Hourglass, MapPin, Star, Users } from "lucide-react";
import { CategoryBadge, ConfidentialBadge, EscalatedBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { formatLocation, timeAgo } from "@/lib/format";
import type { MyTicket } from "@/lib/tickets/queries";

export function Stars({ rating, className = "size-4" }: { rating: number; className?: string }) {
  return (
    <span className="inline-flex" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= rating ? "fill-star text-star" : "text-text-muted/40"}`} />
      ))}
    </span>
  );
}

export function TicketCard({ ticket, basePath = "/tickets" }: { ticket: MyTicket; basePath?: string }) {
  return (
    // The title link is stretched over the whole card, so the "Merged into" link can sit on top.
    <div className="group relative flex animate-slide-up flex-col gap-3 rounded-3xl border border-border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-xs font-bold text-accent-text">{ticket.ticket_no}</p>
          <h3 className="font-bold text-text group-hover:text-accent-text">
            <Link href={`${basePath}/${ticket.ticket_no}`} className="after:absolute after:inset-0 after:rounded-3xl">
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
          <span className="inline-flex items-center gap-1 rounded-full border border-warning-fg/30 bg-warning-bg px-2.5 py-0.5 text-xs font-semibold text-warning-fg">
            <Copy className="size-3" /> Possible duplicate
          </span>
        )}
        {ticket.following && (
          <span className="inline-flex items-center gap-1 rounded-full border border-info-fg/30 bg-surface-accent px-2.5 py-0.5 text-xs font-semibold text-info-fg">
            <Users className="size-3" /> Following
          </span>
        )}
      </div>

      {ticket.status === "Resolved" && !ticket.following && (
        <p className="flex items-center gap-1.5 rounded-2xl bg-success-bg px-3 py-2 text-xs font-bold text-success-fg">
          <Hourglass className="size-3.5" /> Staff marked this fixed — open it to confirm or reopen
        </p>
      )}
      {ticket.status === "Closed" && (
        <p className="flex items-center gap-2 text-xs font-semibold text-text-muted">
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
          href={`${basePath}/${ticket.merged_into}`}
          className="relative z-10 flex w-fit items-center gap-1.5 rounded-full bg-neutral-bg px-3 py-1 text-xs font-bold text-neutral-fg hover:bg-surface-accent hover:text-accent-text"
        >
          <GitMerge className="size-3.5" /> Merged into {ticket.merged_into} →
        </Link>
      )}

      <div className="flex items-center justify-between gap-3 text-xs font-medium text-text-muted">
        <span className="flex min-w-0 items-center gap-1 truncate">
          <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{formatLocation(ticket)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Clock className="size-3.5" /> {timeAgo(ticket.created_at)}
          <ChevronRight className="size-4 text-text-muted/50 group-hover:text-accent-text" />
        </span>
      </div>
    </div>
  );
}
