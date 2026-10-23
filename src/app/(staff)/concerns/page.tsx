import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Lock, ShieldCheck, Siren } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { StatusBadge } from "@/components/common/badges";
import { ANONYMOUS_STUDENT } from "@/config/feedback";
import { requireProfile } from "@/lib/auth";
import { listConcerns } from "@/lib/concerns/queries";
import { runSlaWatcher } from "@/lib/sla-watcher";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Teacher concerns" };

/** Confidential concerns about teachers (HOD, Dean). The teacher never sees this page or a count of it. */
export default async function ConcernsPage() {
  await requireProfile(["hod", "dean"]);
  await runSlaWatcher(); // escalates anything unacknowledged for 72h
  const items = await listConcerns();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow="Confidential"
        title="Teacher concerns"
        description="Formal concerns from students, always shown as “Anonymous student”. Acknowledge within 72 hours or they go to the Dean."
      />
      {items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No concerns" description="When a student reports a concern about a teacher it appears here and in your notifications." />
      ) : (
        <ul className="space-y-3">
          {items.map((c) => {
            const overdue = !c.acknowledged_at && c.ack_due_at && new Date(c.ack_due_at).getTime() < Date.now();
            return (
              <li key={c.ticket_no}>
                <Link
                  href={`/concerns/${c.ticket_no}`}
                  className={cn(
                    "flex animate-slide-up flex-col gap-2 rounded-3xl border bg-surface p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md",
                    c.escalated_at ? "border-danger-fg/40" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-text">{c.ticket_no}</span>
                    <StatusBadge status={c.status} />
                    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-bold text-neutral-fg"><Lock className="size-3" /> Confidential</span>
                    {c.escalated_at && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-bold text-danger-fg"><Siren className="size-3" /> Escalated to Dean</span>
                    )}
                    {!c.acknowledged_at && !c.escalated_at && (
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", overdue ? "bg-danger-bg text-danger-fg" : "bg-warning-bg text-warning-fg")}>
                        <Clock className="size-3" /> Not acknowledged
                      </span>
                    )}
                    <span className="ml-auto text-xs text-text-muted">{timeAgo(c.created_at)}</span>
                  </div>
                  <h3 className="text-base font-bold text-text">{c.concern_category} · {c.teacher_name} · {c.subject}</h3>
                  {c.neutral_summary && <p className="line-clamp-2 text-sm text-text-muted">{c.neutral_summary}</p>}
                  <p className="text-xs text-text-muted">Reported by {ANONYMOUS_STUDENT}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
