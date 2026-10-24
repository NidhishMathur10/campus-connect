import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { AttachmentPreview, AudienceChip, formatWhen, NoticeTypeBadge, PinnedBadge, StatusPill } from "@/components/notices/notice-bits";
import { PosterActions } from "@/components/notices/poster-actions";
import { StatsLine } from "@/components/notices/poster-bits";
import { Button } from "@/components/ui/button";
import { NOTICE_POSTER_ROLES } from "@/config/notices";
import { requireProfile } from "@/lib/auth";
import { formatDateTime, timeAgo } from "@/lib/format";
import { getNoticeForPoster, noticeLog, noticeStats } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Notice" };

export default async function PosterNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(NOTICE_POSTER_ROLES);
  const { id } = await params;
  const notice = await getNoticeForPoster(id);
  if (!notice) notFound();
  const [stats, log] = await Promise.all([noticeStats([notice]), noticeLog(id)]);
  const s = stats.get(id)!;
  const canEdit = notice.author_id === profile.id || profile.role === "dean";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Notice board"
        title={notice.title}
        actions={
          <Button variant="outline" asChild>
            <Link href="/notices"><ArrowLeft /> All notices</Link>
          </Button>
        }
      />

      <section className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <NoticeTypeBadge type={notice.type} />
          <StatusPill status={notice.status} />
          {notice.pinned && <PinnedBadge />}
          {notice.category && <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text-muted">{notice.category}</span>}
          <AudienceChip audience={notice.audience} />
        </div>
        <p className="text-xs text-text-muted">
          Posted by {notice.author_name} · {formatDateTime(notice.created_at)}
          {notice.expires_at && ` · ${notice.status === "expired" ? "expired" : "expires"} ${formatDateTime(notice.expires_at)}`}
        </p>
        {notice.summary && <p className="text-sm font-semibold text-text">{notice.summary}</p>}
        <p className="text-sm leading-relaxed whitespace-pre-line text-text-muted">{notice.body}</p>
        {notice.body_hi && (
          <div lang="hi" className="space-y-1 rounded-2xl bg-surface-2 p-4">
            <p className="eyebrow">हिन्दी</p>
            {notice.title_hi && <p className="font-bold text-text">{notice.title_hi}</p>}
            <p className="text-sm leading-relaxed whitespace-pre-line text-text-muted">{notice.body_hi}</p>
          </div>
        )}
        {(notice.event_at || notice.expected_fix_at) && (
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            {notice.event_at && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-violet-bg px-3 py-1.5 text-violet-fg"><CalendarDays className="size-4" /> {formatWhen(notice.event_at)}</span>
            )}
            {notice.expected_fix_at && (
              <span className="inline-flex items-center gap-1.5 rounded-xl bg-warning-bg px-3 py-1.5 text-warning-fg"><Clock className="size-4" /> Expected fix · {formatWhen(notice.expected_fix_at)}</span>
            )}
          </div>
        )}
        {notice.resolution_note && <p className="rounded-xl bg-success-bg px-3 py-2 text-sm font-semibold text-success-fg">{notice.resolution_note}</p>}
        {notice.attachment_url && <AttachmentPreview url={notice.attachment_url} />}
      </section>

      <section className="space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <h2 className="eyebrow">Reach</h2>
        <StatsLine stats={s} type={notice.type} />
        <p className="text-xs text-text-muted">Counts students who opened the notice. &ldquo;Got it&rdquo; is the button students tap to confirm.</p>
      </section>

      {canEdit && (
        <section className="space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
          <h2 className="eyebrow">Manage</h2>
          <PosterActions id={notice.id} title={notice.title} canResolve={notice.type === "known_issue" && notice.status === "active"} followers={s.followers} />
        </section>
      )}

      <section className="space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <h2 className="eyebrow">Activity</h2>
        {log.length === 0 ? (
          <p className="text-sm text-text-muted">Nothing yet.</p>
        ) : (
          <ul className="space-y-2">
            {log.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-bold text-text capitalize">{l.action.replace("_", " ")}</span>
                <span className="text-text-muted">{l.detail ? `${l.detail} · ` : ""}{l.actor_name} · {timeAgo(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
