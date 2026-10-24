"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Flag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { campusNow, DAY_NAMES, DAY_SHORT, formatClock, MEAL_LABELS, MEALS, mealStarted, type Meal } from "@/config/mess";
import type { MenuData, MyRating } from "@/lib/mess/types";
import { cn } from "@/lib/utils";
import { DietDot, DietLegend, ItemLine } from "./diet";
import { DAY_HI, MEAL_HI, useDishLanguage } from "./hindi";
import { LangToggle } from "./lang-toggle";
import { RateMeal } from "./rate-meal";

/** The week's menu: printed-chart grid on desktop, day tabs on mobile, plus rate / report for today's meals. */
export function MessMenuView({ menu, messLabel, nowIso, myRatings, canRate }: { menu: MenuData; messLabel: string; nowIso: string; myRatings: MyRating[]; canRate: boolean }) {
  const [now, setNow] = useState(() => campusNow(new Date(nowIso)));
  useEffect(() => {
    setNow(campusNow());
    const id = setInterval(() => setNow(campusNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { lang, choose, t, loading } = useDishLanguage(menu);
  const hi = lang === "hi";
  const mealName = (m: Meal) => (hi ? MEAL_HI[m] : MEAL_LABELS[m]);
  const [day, setDay] = useState(() => campusNow(new Date(nowIso)).day);
  const [rating, setRating] = useState<Meal | null>(null);
  const [saved, setSaved] = useState<Record<string, MyRating>>(Object.fromEntries(myRatings.map((r) => [r.meal, r])));
  const extrasFor = (m: Meal) => menu.extras.filter((e) => e.meals.includes(m));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">{messLabel}</p>
          <h2 className="text-lg font-extrabold tracking-tight text-text">{menu.title}</h2>
        </div>
        <LangToggle lang={lang} onChange={choose} loading={loading} />
      </div>

      {/* Today's meals: rate + report */}
      <section aria-labelledby="today-meals" className="space-y-3">
        <h3 id="today-meals" className="eyebrow">Today · {hi ? DAY_HI[now.day] : DAY_NAMES[now.day]}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MEALS.map((m) => {
            const started = mealStarted(now, menu.timings, m);
            const mine = saved[m];
            const tm = menu.timings[m];
            return (
              <div key={m} className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm">
                <div>
                  <p className="font-extrabold text-text">{mealName(m)}</p>
                  <p className="text-xs font-semibold text-text-muted">{formatClock(tm.start)} – {formatClock(tm.end)}</p>
                </div>
                {rating === m ? (
                  <RateMeal
                    meal={m}
                    existing={mine}
                    onDone={(stars, comment) => {
                      setSaved((s) => ({ ...s, [m]: { meal: m, rating: stars, comment } }));
                      setRating(null);
                    }}
                  />
                ) : (
                  canRate && (
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant={mine ? "secondary" : "outline"} disabled={!started} onClick={() => setRating(m)} title={started ? undefined : "Available once the meal starts"}>
                        {mine ? <CheckCircle2 /> : <Star />} {mine ? `Rated ${mine.rating}★` : "Rate this meal"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" asChild>
                        <Link href={`/hostel?mess=${m}`}><Flag /> Report a problem</Link>
                      </Button>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Mobile: day tabs */}
      <section className="md:hidden" aria-label="Weekly menu by day">
        <div role="tablist" className="mb-3 flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
          {DAY_SHORT.map((d, i) => (
            <button
              key={d}
              role="tab"
              aria-selected={day === i}
              onClick={() => setDay(i)}
              className={cn("flex-1 rounded-full px-3 py-1.5 text-sm font-bold whitespace-nowrap transition-colors", day === i ? "bg-primary text-primary-fg" : i === now.day ? "text-accent-text" : "text-text-muted")}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {MEALS.map((m) => (
            <div key={m} className="rounded-3xl border border-border bg-surface p-4">
              <p className="flex items-baseline justify-between">
                <span className="font-extrabold text-text">{mealName(m)}</span>
                <span className="text-xs font-semibold text-text-muted">{formatClock(menu.timings[m].start)}</span>
              </p>
              <ul className="mt-2 space-y-1.5 text-sm font-semibold text-text">
                {menu.grid[day][m].map((it, i) => <li key={i}><ItemLine item={it} t={t} /></li>)}
                {extrasFor(m).map((e) => <li key={e.name} className="inline-flex items-center gap-1.5 text-text-muted"><DietDot type="veg" /> {t(e.name)}</li>)}
                {menu.grid[day][m].length === 0 && <li className="text-text-muted">Not added yet</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Desktop: printed-chart grid */}
      <section className="hidden overflow-x-auto rounded-3xl border border-border bg-surface shadow-sm md:block" aria-label="Weekly menu">
        <table className="w-full min-w-[920px] table-fixed border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-24 border-b border-border p-3 text-left"><span className="eyebrow">Meal</span></th>
              {DAY_NAMES.map((d, i) => (
                <th key={d} className={cn("border-b border-l border-border p-3 text-left font-extrabold", i === now.day ? "bg-primary text-primary-fg" : "text-text")}>
                  {hi ? DAY_HI[i] : d}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEALS.map((m) => (
              <tr key={m}>
                <th scope="row" className="border-b border-border p-3 text-left align-top">
                  <span className="block font-extrabold text-text">{mealName(m)}</span>
                  <span className="block text-[11px] font-semibold text-text-muted">{formatClock(menu.timings[m].start)}</span>
                </th>
                {DAY_NAMES.map((d, i) => (
                  <td key={d} className={cn("border-b border-l border-border p-3 align-top", i === now.day && "bg-surface-accent")}>
                    <ul className="space-y-1.5 font-semibold text-text">
                      {menu.grid[i][m].map((it, k) => <li key={k}><ItemLine item={it} t={t} /></li>)}
                    </ul>
                  </td>
                ))}
              </tr>
            ))}
            {menu.extras.map((e) => (
              <tr key={e.name}>
                <th scope="row" className="p-3 text-left align-top"><span className="block font-extrabold text-text">{t(e.name)}</span></th>
                <td colSpan={7} className="border-l border-border p-3 text-text-muted">
                  Served daily with {e.meals.length === MEALS.length ? "all meals" : e.meals.map((x) => MEAL_LABELS[x]).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="space-y-2">
        <DietLegend />
        {menu.footer && <p className="text-xs text-text-muted">{menu.footer}</p>}
      </div>
    </div>
  );
}
