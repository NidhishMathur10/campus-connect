"use client";

import Link from "next/link";
import { Copy, Loader2, MapPin, Search, Users } from "lucide-react";
import { StatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import type { TicketStatus } from "@/config/statuses";
import type { DuplicateMatch } from "@/lib/ai/complaint";
import { formatLocation, timeAgo } from "@/lib/format";

/**
 * Shown inside the ticket preview. While the check runs it is a thin "checking" line; if a
 * similar open ticket exists it offers "Me too" (someone else's ticket) or a link to the
 * student's own ticket, plus a way to submit anyway.
 */
export function SimilarTicketCard({
  checking,
  match,
  onMeToo,
  onSubmitNew,
  busy,
}: {
  checking: boolean;
  match: DuplicateMatch | null;
  onMeToo: () => void;
  onSubmitNew: () => void;
  busy: "metoo" | "new" | null;
}) {
  if (checking) {
    return (
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Search className="size-3.5" /> Checking whether this is already reported… <Loader2 className="size-3.5 animate-spin" />
      </p>
    );
  }
  if (!match) return null;

  const following = match.already_following;
  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
      <div className="space-y-1 px-4 pt-4">
        <p className="eyebrow flex items-center gap-1.5 text-amber-700">
          <Copy className="size-3.5" /> Similar open ticket found
        </p>
        <p className="text-lg font-extrabold text-foreground">
          {match.is_own
            ? `You already reported this as ${match.ticket_no}`
            : following
              ? `You're already following ${match.ticket_no}`
              : `This may already be reported as ${match.ticket_no}`}
        </p>
        <p className="text-sm text-amber-900">
          {Math.round(match.similarity * 100)}% similar — {match.reason}
        </p>
      </div>

      <div className="space-y-2 px-4 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-foreground">{match.ticket_no}</span>
          <StatusBadge status={match.status as TicketStatus} />
          <span className="text-xs text-slate-500">reported {timeAgo(match.created_at)}</span>
        </div>
        <p className="font-bold text-foreground">{match.title}</p>
        {match.summary && <p className="text-sm text-slate-600">{match.summary}</p>}
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <MapPin className="size-3.5" /> {formatLocation(match)}
        </p>
      </div>

      <div className="flex flex-col gap-2 px-4 pt-3 pb-4 sm:flex-row">
        {match.is_own || following ? (
          <Button asChild>
            <Link href={`/tickets/${match.ticket_no}`}>{match.is_own ? "View my ticket" : "View ticket"}</Link>
          </Button>
        ) : (
          <Button onClick={onMeToo} disabled={!!busy}>
            {busy === "metoo" ? <Loader2 className="animate-spin" /> : <Users />}
            Me too — follow it
          </Button>
        )}
        <Button variant="outline" onClick={onSubmitNew} disabled={!!busy}>
          {busy === "new" && <Loader2 className="animate-spin" />}
          {match.is_own ? "Submit anyway" : "Submit as new"}
        </Button>
      </div>
    </div>
  );
}
