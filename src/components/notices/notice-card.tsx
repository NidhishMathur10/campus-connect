"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, CalendarDays, Check, Clock, Loader2, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeNotice, followKnownIssue } from "@/lib/notices/actions";
import type { NoticeView } from "@/lib/notices/queries";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AttachmentPreview, AudienceChip, formatWhen, NoticeTypeBadge, PinnedBadge, StatusPill } from "./notice-bits";

export type NoticeLang = "en" | "hi";

/** One notice for students: type badge, Hindi / English text, attachment, "Got it", and "Me too" on known issues. */
export function NoticeCard({ notice, lang, highlighted }: { notice: NoticeView; lang: NoticeLang; highlighted?: boolean }) {
  const [acknowledged, setAcknowledged] = useState(notice.acknowledged);
  const [following, setFollowing] = useState(notice.following);
  const [pending, start] = useTransition();
  const hindi = lang === "hi" && !!notice.body_hi;
  const title = hindi ? notice.title_hi || notice.title : notice.title;
  const body = hindi ? notice.body_hi! : notice.body;
  const urgent = notice.type === "urgent" && notice.status === "active";
  const resolved = notice.status === "resolved";

  function gotIt() {
    start(async () => {
      const res = await acknowledgeNotice(notice.id);
      if (res.ok) setAcknowledged(true);
      else toast.error(res.error);
    });
  }

  function meToo() {
    start(async () => {
      const res = await followKnownIssue(notice.id);
      if (res.ok) {
        setFollowing(true);
        toast.success("You'll be notified when this is fixed.");
      } else toast.error(res.error);
    });
  }

  return (
    <article
      id={`notice-${notice.id}`}
      className={cn(
        "animate-slide-up space-y-3 rounded-3xl border bg-surface p-5 shadow-sm",
        urgent ? "border-danger-fg/40" : "border-border",
        highlighted && "ring-2 ring-ring",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <NoticeTypeBadge type={notice.type} />
        {notice.pinned && <PinnedBadge />}
        {resolved && <StatusPill status="resolved" />}
        {notice.category && (
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text-muted">{notice.category}</span>
        )}
        {!notice.seen && !acknowledged && (
          <span className="rounded-full bg-accent-blue px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary-fg uppercase">New</span>
        )}
      </div>

      <div className="space-y-1.5">
        <h3 lang={hindi ? "hi" : "en"} className="text-lg font-extrabold tracking-tight text-text">{title}</h3>
        <p lang={hindi ? "hi" : "en"} className="text-sm leading-relaxed whitespace-pre-line text-text-muted">{body}</p>
      </div>

      {(notice.event_at || notice.expected_fix_at) && (
        <div className="flex flex-wrap gap-2 text-sm font-semibold text-text">
          {notice.event_at && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-violet-bg px-3 py-1.5 text-violet-fg">
              <CalendarDays className="size-4" /> {formatWhen(notice.event_at)}
            </span>
          )}
          {notice.expected_fix_at && !resolved && (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-warning-bg px-3 py-1.5 text-warning-fg">
              <Clock className="size-4" /> Expected fix · {formatWhen(notice.expected_fix_at)}
            </span>
          )}
        </div>
      )}

      {resolved && (
        <p className="flex items-start gap-2 rounded-xl bg-success-bg px-3 py-2 text-sm font-semibold text-success-fg">
          <BadgeCheck className="mt-0.5 size-4 shrink-0" />
          {notice.resolution_note || "This has been fixed."}
        </p>
      )}

      {notice.attachment_url && <AttachmentPreview url={notice.attachment_url} />}

      <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
          <span>{notice.author_name}</span>·<span>{timeAgo(notice.created_at)}</span>
          <AudienceChip audience={notice.audience} className="border-0 bg-transparent px-0" />
        </p>
        <div className="flex flex-wrap gap-2">
          {notice.type === "known_issue" && notice.status === "active" && (
            following ? (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-success-bg px-4 text-sm font-bold text-success-fg">
                <Wrench className="size-4" /> Following updates
              </span>
            ) : (
              <Button variant="outline" onClick={meToo} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : <Users />} Me too — follow updates
              </Button>
            )
          )}
          {acknowledged ? (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-bold text-text-muted">
              <Check className="size-4" /> Got it
            </span>
          ) : (
            <Button onClick={gotIt} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Got it
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
