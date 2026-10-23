import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Inbox, ShieldAlert, Siren, Star, Timer } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { EscalationCard } from "@/components/escalations/escalation-bits";
import { BriefAutogen } from "@/components/escalations/escalation-client";
import { LiveRefresh } from "@/components/tickets/live-refresh";
import { requireProfile } from "@/lib/auth";
import { briefMissing, getHomeStats, listEscalations, type EscalationTab } from "@/lib/escalation-queries";
import { checkEscalations, TARGET_LABELS } from "@/lib/escalations";
import { runSlaWatcher } from "@/lib/sla-watcher";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Escalations" };

const TABS: { value: EscalationTab; label: string }[] = [
  { value: "active", label: "Needs attention" },
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export default async function EscalationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await requireProfile(["warden", "dean", "hod"]);
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.value === raw)?.value ?? "active";
  const viewer = { id: profile.id, role: profile.role, department: profile.department };

  await runSlaWatcher();
  await checkEscalations();
  const [items, stats] = await Promise.all([listEscalations(viewer, tab), getHomeStats(viewer)]);

  // Briefs normally get written in the background; catch any that were missed (older than a minute).
  const missing = items.filter(briefMissing).map((e) => e.id);
  const isTarget = profile.role === "dean" || profile.role === "hod";
  const inbox = profile.role === "hod" ? TARGET_LABELS.hod : TARGET_LABELS.dean;

  const cards = stats
    ? [
        { label: "Open escalations", value: stats.openEscalations, icon: Siren, tone: "text-danger-fg" },
        { label: "Acknowledged", value: stats.acknowledged, icon: CheckCircle2, tone: "text-info-fg" },
        { label: "Open tickets", value: stats.openTickets, icon: Inbox, tone: "text-text" },
        { label: "Past deadline", value: stats.overdueTickets, icon: Timer, tone: "text-prio-high-fg" },
        {
          label: "Avg rating (30d)",
          value: stats.avgRating ? stats.avgRating.toFixed(1) : "—",
          icon: Star,
          tone: "text-warning-fg",
          hint: `${stats.closedLast30} closed`,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow={isTarget ? `${inbox} · ${profile.role === "hod" ? "Academic" : "Hostel & Campus + Safety"}` : "Hostel escalations · view only"}
        title={isTarget ? `Good to see you, ${profile.full_name}` : "Escalations"}
        description="Recurring problems, repeated reopens, missed deadlines and manual escalations — each with an AI-written brief."
        actions={<LiveRefresh className="self-center" />}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, tone, hint }) => (
          <div key={label} className="animate-slide-up rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">{label}</p>
              <Icon className={cn("size-4", tone)} />
            </div>
            <p className={cn("mt-2 text-3xl font-extrabold", tone)}>{value}</p>
            {hint && <p className="text-xs text-text-muted">{hint}</p>}
          </div>
        ))}
      </div>

      <nav className="mb-5 flex w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 sm:w-fit" aria-label="Filter escalations">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "active" ? "/escalations" : `/escalations?tab=${t.value}`}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
              tab === t.value ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2",
            )}
            aria-current={tab === t.value ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={tab === "active" ? ShieldAlert : AlertTriangle}
          title={tab === "active" ? "Nothing needs your attention" : "No escalations here"}
          description="Escalations appear automatically when an issue recurs, a fix fails twice, or an urgent ticket misses its deadline."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((e) => (
            <EscalationCard key={e.id} e={e} />
          ))}
        </div>
      )}
      {missing.length > 0 && <BriefAutogen ids={missing} />}
    </>
  );
}
