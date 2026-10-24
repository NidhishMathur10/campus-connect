import { CalendarDays, FileText, Megaphone, Pin, Siren, Users, Wrench, type LucideIcon } from "lucide-react";
import { describeAudience, NOTICE_TYPE_LABELS, type NoticeAudience, type NoticeType } from "@/config/notices";
import { cn } from "@/lib/utils";

const base =
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export const NOTICE_TYPE_STYLES: Record<NoticeType, { icon: LucideIcon; className: string }> = {
  notice: { icon: Megaphone, className: "bg-info-bg text-info-fg border-info-fg/30" },
  urgent: { icon: Siren, className: "bg-danger-bg text-danger-fg border-danger-fg/30" },
  known_issue: { icon: Wrench, className: "bg-warning-bg text-warning-fg border-warning-fg/30" },
  event: { icon: CalendarDays, className: "bg-violet-bg text-violet-fg border-violet-fg/30" },
};

export function NoticeTypeBadge({ type, className }: { type: NoticeType; className?: string }) {
  const { icon: Icon, className: style } = NOTICE_TYPE_STYLES[type];
  return (
    <span className={cn(base, style, className)}>
      <Icon className="size-3" /> {NOTICE_TYPE_LABELS[type]}
    </span>
  );
}

export function PinnedBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-border bg-neutral-bg text-neutral-fg", className)}>
      <Pin className="size-3" /> Pinned
    </span>
  );
}

export function StatusPill({ status, className }: { status: "active" | "resolved" | "expired"; className?: string }) {
  const style =
    status === "resolved"
      ? "bg-success-bg text-success-fg border-success-fg/30"
      : status === "expired"
        ? "bg-neutral-bg text-neutral-fg border-border"
        : "bg-info-bg text-info-fg border-info-fg/30";
  return <span className={cn(base, style, className)}>{status === "active" ? "Live" : status === "resolved" ? "Resolved" : "Expired"}</span>;
}

export function AudienceChip({ audience, className }: { audience: NoticeAudience; className?: string }) {
  return (
    <span className={cn(base, "border-border bg-surface text-text-muted", className)}>
      <Users className="size-3" /> {describeAudience(audience)}
    </span>
  );
}

/** "https://…/uid/abc-timetable.pdf" -> "timetable.pdf" */
export function attachmentName(url: string): string {
  const last = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "attachment");
  return last.replace(/^[0-9a-f-]{36}-/i, "");
}

export const isImageUrl = (url: string) => /\.(png|jpe?g|webp)$/i.test(url.split("?")[0]);

/** PDF link chip or an inline image preview. */
export function AttachmentPreview({ url }: { url: string }) {
  if (isImageUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-border">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded attachment */}
        <img src={url} alt={attachmentName(url)} className="max-h-64 w-full bg-surface-2 object-contain" loading="lazy" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3 transition-colors hover:border-accent-blue"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-bg text-danger-fg">
        <FileText className="size-5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-text">{attachmentName(url)}</span>
        <span className="block text-xs text-text-muted">PDF · tap to open</span>
      </span>
    </a>
  );
}

/** "Today, 6:00 PM" style date for notice cards. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}
