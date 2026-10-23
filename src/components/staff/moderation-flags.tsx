import { Flag } from "lucide-react";
import { MODERATION_FLAG } from "@/config/moderation";
import { timeAgo } from "@/lib/format";
import type { ModerationFlag } from "@/lib/moderation";

/** Warden dashboard: people whose submissions were blocked several times in 24 hours. Renders nothing when there are none. */
export function ModerationFlags({ flags }: { flags: ModerationFlag[] }) {
  if (flags.length === 0) return null;
  return (
    <section className="mb-6 animate-slide-up rounded-3xl border border-warning-fg/30 bg-warning-bg p-5">
      <h2 className="flex items-center gap-2 text-base font-extrabold text-warning-fg">
        <Flag className="size-4.5" /> Repeated blocked submissions
      </h2>
      <p className="mt-1 text-sm text-warning-fg/80">
        {MODERATION_FLAG.blocks}+ complaints or photos blocked in the last {MODERATION_FLAG.hours} hours. For your
        information only — nobody is banned automatically.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {flags.map((f) => (
          <li
            key={f.user_id}
            className="inline-flex items-center gap-2 rounded-full border border-warning-fg/30 bg-surface px-3 py-1.5 text-sm font-semibold text-text"
          >
            <span className="font-mono">{f.who}</span>
            <span className="rounded-full bg-warning-solid px-2 py-0.5 text-xs font-bold text-warning-solid-fg">{f.blocks} blocks</span>
            <span className="text-xs font-medium text-text-muted">last {timeAgo(f.last_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
