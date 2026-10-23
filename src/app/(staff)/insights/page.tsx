import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, Inbox, Star, Ticket } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { DailyLine, RankedBars, StatusBars } from "@/components/insights/charts";
import { Hotspots } from "@/components/insights/hotspots";
import { MODULE_LABELS, type TicketModule } from "@/config/routing";
import { requireProfile } from "@/lib/auth";
import { checkEscalations } from "@/lib/escalations";
import { getInsights, INSIGHT_WINDOWS, insightsModule, type InsightWindow } from "@/lib/insights";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Insights" };

function hoursLabel(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function Panel({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("animate-slide-up rounded-3xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <p className="eyebrow">{title}</p>
      {subtitle && <p className="mb-3 text-xs text-slate-500">{subtitle}</p>}
      <div className={subtitle ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Pills<T extends string | number>({
  options,
  value,
  href,
}: {
  options: { value: T; label: string }[];
  value: T;
  href: (v: T) => string;
}) {
  return (
    <nav className="flex w-fit gap-1 rounded-full border border-slate-200 bg-white p-1">
      {options.map((o) => (
        <Link
          key={String(o.value)}
          href={href(o.value)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap",
            o.value === value ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {o.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ module?: string; days?: string }> }) {
  const profile = await requireProfile(["warden", "dean", "hod"]);
  const sp = await searchParams;
  const viewer = { id: profile.id, role: profile.role, department: profile.department };
  const scopeModule = insightsModule(viewer, sp.module);
  if (scopeModule === "forbidden") redirect("/");
  const days: InsightWindow = sp.days === "7" ? 7 : 30;

  await checkEscalations();
  const data = await getInsights(scopeModule, days);
  const { stats } = data;

  const qs = (m: TicketModule | "all" | null, d: number) => {
    const p = new URLSearchParams();
    if (m && m !== "all") p.set("module", m);
    if (d !== 30) p.set("days", String(d));
    const s = p.toString();
    return s ? `/insights?${s}` : "/insights";
  };

  const cards = [
    { label: `Tickets (${days}d)`, value: String(stats.total), icon: Ticket, tone: "text-navy" },
    { label: "Open now", value: String(stats.open), icon: Inbox, tone: "text-orange-600" },
    { label: "Avg resolution", value: hoursLabel(stats.avgResolutionHours), icon: Clock, tone: "text-violet-600" },
    { label: "Within SLA", value: stats.withinSlaPct == null ? "—" : `${stats.withinSlaPct}%`, icon: CheckCircle2, tone: "text-emerald-600" },
    {
      label: "Student rating",
      value: stats.avgRating ? stats.avgRating.toFixed(1) : "—",
      icon: Star,
      tone: "text-amber-500",
      hint: stats.ratedCount ? `${stats.ratedCount} rating${stats.ratedCount === 1 ? "" : "s"}` : "no ratings yet",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={scopeModule ? MODULE_LABELS[scopeModule] : "All modules"}
        title="Insights"
        description="Recurring issues, hotspots and how fast things get fixed."
        actions={
          <div className="flex flex-wrap gap-2">
            {profile.role === "dean" && (
              <Pills
                options={[
                  { value: "all", label: "All" },
                  { value: "hostel", label: "Hostel" },
                  { value: "academic", label: "Academic" },
                ]}
                value={scopeModule ?? "all"}
                href={(m) => qs(m as TicketModule | "all", days)}
              />
            )}
            <Pills options={INSIGHT_WINDOWS.map((d) => ({ value: d, label: `Last ${d} days` }))} value={days} href={(d) => qs(scopeModule, d)} />
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, tone, hint }) => (
          <div key={label} className="animate-slide-up rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">{label}</p>
              <Icon className={cn("size-4", tone)} />
            </div>
            <p className={cn("mt-2 text-3xl font-extrabold", tone)}>{value}</p>
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Panel title="Hotspots" subtitle="Same place + same problem, 2 or more times. Click one to see its tickets." className="lg:row-span-2">
          <Hotspots hotspots={data.hotspots} days={days} />
        </Panel>
        <Panel title="New tickets · last 14 days">
          <DailyLine data={data.daily} />
        </Panel>
        <Panel title={`Status breakdown · ${days} days`} subtitle="Includes Closed and Merged duplicates.">
          <StatusBars data={data.statusBreakdown} />
        </Panel>
        <Panel title={`By category · ${days} days`}>
          <RankedBars data={data.byCategory} />
        </Panel>
        <Panel title={`By building · ${days} days`}>
          <RankedBars data={data.byBuilding} />
        </Panel>
      </div>

      <Panel title="Department performance" subtitle={`Open = right now; other columns = tickets reported in the last ${days} days.`} className="mt-5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="border-b border-slate-200 text-left">
              <tr>
                {["Department", "Open", "Tickets", "Avg resolution", "SLA breaches", "Avg rating"].map((h) => (
                  <th key={h} className="eyebrow px-3 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.departments.map((d) => (
                <tr key={d.department} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2.5 font-semibold text-navy">{d.department}</td>
                  <td className="px-3 py-2.5">{d.open}</td>
                  <td className="px-3 py-2.5">{d.total}</td>
                  <td className="px-3 py-2.5">{hoursLabel(d.avgResolutionHours)}</td>
                  <td className={cn("px-3 py-2.5", d.slaBreaches > 0 && "font-bold text-red-600")}>{d.slaBreaches}</td>
                  <td className="px-3 py-2.5">{d.avgRating ? `★ ${d.avgRating.toFixed(1)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
