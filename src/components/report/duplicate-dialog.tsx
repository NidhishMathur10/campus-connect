"use client";

import Link from "next/link";
import { Copy, Loader2, MapPin, Users } from "lucide-react";
import { StatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TicketStatus } from "@/config/statuses";
import type { DuplicateMatch } from "@/lib/ai/complaint";
import { formatLocation, timeAgo } from "@/lib/format";

export function DuplicateDialog({
  match,
  onMeToo,
  onSubmitNew,
  onClose,
  busy,
}: {
  match: DuplicateMatch | null;
  onMeToo: () => void;
  onSubmitNew: () => void;
  onClose: () => void;
  busy: "metoo" | "new" | null;
}) {
  const ownOrFollowing = match?.is_own || match?.already_following;

  return (
    <Dialog open={!!match} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-3xl p-0 sm:max-w-lg" showCloseButton={!busy}>
        {match && (
          <>
            <DialogHeader className="space-y-1 border-b border-amber-200 bg-amber-50 px-6 pt-6 pb-4 text-left">
              <p className="eyebrow flex items-center gap-1.5 text-amber-700"><Copy className="size-3.5" /> Possible duplicate</p>
              <DialogTitle className="text-xl font-extrabold text-navy">
                {match.is_own
                  ? `You already reported this as ${match.ticket_no}`
                  : `This may already be reported as ${match.ticket_no}`}
              </DialogTitle>
              <DialogDescription className="text-amber-900">
                {Math.round(match.similarity * 100)}% similar — {match.reason}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 px-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-navy">{match.ticket_no}</span>
                <StatusBadge status={match.status as TicketStatus} />
                <span className="text-xs text-slate-500">reported {timeAgo(match.created_at)}</span>
              </div>
              <p className="font-bold text-navy">{match.title}</p>
              {match.summary && <p className="text-sm text-slate-600">{match.summary}</p>}
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <MapPin className="size-3.5" /> {formatLocation(match)}
              </p>
              {match.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL
                <img src={match.photo_url} alt="Photo on the existing ticket" className="max-h-48 rounded-2xl border border-slate-200 object-cover" />
              )}
            </div>

            <div className="flex flex-col gap-2 px-6 pb-6">
              {ownOrFollowing ? (
                <Button size="lg" asChild>
                  <Link href={`/tickets/${match.ticket_no}`}>
                    {match.is_own ? "View my ticket" : "You're already following — view it"}
                  </Link>
                </Button>
              ) : (
                <Button size="lg" onClick={onMeToo} disabled={!!busy}>
                  {busy === "metoo" ? <Loader2 className="animate-spin" /> : <Users />}
                  Me too — follow this ticket
                </Button>
              )}
              <Button size="lg" variant="outline" onClick={onSubmitNew} disabled={!!busy}>
                {busy === "new" && <Loader2 className="animate-spin" />}
                No, it&apos;s different — submit as new
              </Button>
              <p className="text-center text-xs text-slate-500">
                &quot;Me too&quot; adds you to the existing ticket so you get its updates, and shows staff more students are affected.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
