import Link from "next/link";
import { BadgeCheck, Eye, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NoticeStats } from "@/lib/notices/queries";
import type { Notice } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { AudienceChip, NoticeTypeBadge, PinnedBadge, StatusPill } from "./notice-bits";

/** "Seen by 5 of 7" with a thin progress bar, then Got it and (known issues) followers. */
export function StatsLine({ stats, type, compact }: { stats: NoticeStats; type: Notice["type"]; compact?: boolean }) {
  const pct = stats.audience > 0 ? Math.min(100, Math.round((stats.seen / stats.audience) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-text">
        <span className="inline-flex items-center gap-1.5">
          <Eye className="size-4 text-text-muted" /> Seen by {stats.seen} of {stats.audience}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <BadgeCheck className="size-4 text-text-muted" /> {stats.acknowledged} got it
        </span>
        {type === "known_issue" && (
          <span className="inline-flex items-center gap-1.5 text-warning-fg">
            <Users className="size-4" /> {stats.followers} {stats.followers === 1 ? "student" : "students"} affected
          </span>
        )}
      </div>
      {!compact && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Seen">
          <div className={cn("h-full rounded-full bg-accent-blue transition-all")} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

/** One row of the poster's notice list. */
export function PosterRow({ notice, stats, mine }: { notice: Notice; stats: NoticeStats | undefined; mine: boolean }) {
  return (
    <Link
      href={`/notices/${notice.id}`}
      className="block animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent-blue"
    >
      <div className="flex flex-wrap items-center gap-2">
        <NoticeTypeBadge type={notice.type} />
        <StatusPill status={notice.status} />
        {notice.pinned && <PinnedBadge />}
        <AudienceChip audience={notice.audience} />
      </div>
      <div>
        <p className="text-lg font-extrabold tracking-tight text-text">{notice.title}</p>
        <p className="text-xs text-text-muted">
          {mine ? "You" : notice.author_name} · {timeAgo(notice.created_at)}
        </p>
      </div>
      {stats && <StatsLine stats={stats} type={notice.type} compact />}
    </Link>
  );
}
