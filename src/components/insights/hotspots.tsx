"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Flame, Layers, Loader2, Minus, RefreshCw, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { CategoryBadge, StatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { parseHotspotKey } from "@/lib/hotspots";
import type { Hotspot } from "@/lib/insights";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

async function fetchInsight(key: string, days: number, force: boolean): Promise<{ ok: boolean; recommendation?: string; error?: string }> {
  try {
    const res = await fetch("/api/ai/hotspot-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, days, force }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: "Network error." };
  }
}

const TREND = {
  up: { icon: TrendingUp, className: "text-red-700", label: "Rising" },
  down: { icon: TrendingDown, className: "text-emerald-700", label: "Falling" },
  flat: { icon: Minus, className: "text-slate-500", label: "Steady" },
};

export function Hotspots({ hotspots, days }: { hotspots: Hotspot[]; days: number }) {
  const [open, setOpen] = useState<string | null>(hotspots[0]?.key ?? null);
  const [recs, setRecs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const started = useRef(false);

  async function generate(key: string, manual: boolean) {
    setLoading((l) => ({ ...l, [key]: true }));
    const res = await fetchInsight(key, days, manual);
    setLoading((l) => ({ ...l, [key]: false }));
    if (res.recommendation) setRecs((r) => ({ ...r, [key]: res.recommendation! }));
    if (manual) {
      if (res.ok) toast.success("Recommendation updated");
      else toast.error(res.error ?? "Gemini is unavailable right now.");
    }
  }

  // Fill in hotspots that have never had a recommendation (one at a time — small Gemini quota).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const missing = hotspots.filter((h) => !h.insight).map((h) => h.key);
    void (async () => {
      for (const key of missing) await generate(key, false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  if (hotspots.length === 0) {
    return <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No room, place or floor has repeated complaints in this period. 🎉</p>;
  }

  return (
    <ul className="space-y-2.5">
      {hotspots.map((h, i) => {
        const trend = TREND[h.trend];
        const TrendIcon = trend.icon;
        const rec = recs[h.key] ?? h.insight?.recommendation;
        const isOpen = open === h.key;
        return (
          <li key={h.key} className={cn("rounded-2xl border bg-card transition-colors", isOpen ? "border-accent-blue" : "border-border")}>
            <button type="button" onClick={() => setOpen(isOpen ? null : h.key)} className="flex w-full items-center gap-3 p-3.5 text-left">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold",
                  i === 0 ? "bg-red-600 text-white" : "bg-orange-50 text-orange-700",
                )}
              >
                {i === 0 ? <Flame className="size-4" /> : h.count}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-bold text-foreground">
                  <span className="truncate">{h.label}</span>
                  {h.floorLevel && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                      <Layers className="size-3" /> Floor-level
                    </span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {h.count} tickets in {h.floorLevel ? 7 : days} days{h.floorLevel ? " · different rooms" : ""}
                  </span>
                  <span className={cn("inline-flex items-center gap-1 font-semibold", trend.className)}>
                    <TrendIcon className="size-3.5" /> {trend.label} (prev. {h.prevCount})
                  </span>
                </p>
              </div>
              <ChevronDown className={cn("size-4 shrink-0 text-slate-500 transition-transform", isOpen && "rotate-180")} />
            </button>

            <div className="space-y-3 border-t border-border/60 px-3.5 pt-3 pb-3.5">
              <div className="flex items-start gap-2 rounded-xl bg-sky-tint p-2.5 text-sm">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-text" />
                <p className="flex-1 text-slate-800">
                  {rec ?? (loading[h.key] ? "Gemini is thinking…" : "No recommendation yet.")}
                  {h.insight?.stale && !recs[h.key] && <span className="ml-1 text-xs text-amber-700">(new tickets since — refresh)</span>}
                </p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Refresh recommendation"
                  title={h.insight ? `Generated ${timeAgo(h.insight.generated_at)}` : "Generate"}
                  disabled={loading[h.key]}
                  onClick={() => generate(h.key, true)}
                >
                  {loading[h.key] ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                </Button>
              </div>

              {isOpen && (
                <ul className="animate-fade-in space-y-1.5">
                  <li className="pb-1"><CategoryBadge category={parseHotspotKey(h.key).category} /></li>
                  {h.tickets.map((t) => (
                    <li key={t.ticket_no}>
                      <Link
                        href={`/staff/history?t=${t.ticket_no}`}
                        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-slate-50"
                      >
                        <span className="font-mono text-xs font-bold text-accent-text">{t.ticket_no}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-700">{t.title}</span>
                        <span className="hidden text-xs text-slate-500 sm:inline">{timeAgo(t.created_at)}</span>
                        <StatusBadge status={t.status} className="text-[11px]" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
