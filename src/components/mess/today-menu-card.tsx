"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, UtensilsCrossed } from "lucide-react";
import { campusNow, DAY_NAMES, formatClock, MEAL_LABELS, mealStatus } from "@/config/mess";
import type { MenuData } from "@/lib/mess/types";
import { DietDot, ItemLine } from "./diet";
import { LangToggle } from "./lang-toggle";
import { DAY_HI, MEAL_HI, useDishLanguage } from "./hindi";

/** "Today's menu" on the student home: today's day, the meal being served (or next), its dishes, and what comes after. */
export function TodayMenuCard({ menu, messLabel, nowIso }: { menu: MenuData; messLabel: string; nowIso: string }) {
  const [now, setNow] = useState(() => campusNow(new Date(nowIso)));
  useEffect(() => {
    setNow(campusNow());
    const id = setInterval(() => setNow(campusNow()), 60_000);
    return () => clearInterval(id);
  }, []);
  const { lang, choose, t, loading } = useDishLanguage(menu);

  const status = mealStatus(now, menu.timings);
  const hiMode = lang === "hi";
  const mealName = (m: keyof typeof MEAL_LABELS) => (hiMode ? MEAL_HI[m] : MEAL_LABELS[m]);

  // After dinner the card shows tomorrow's breakfast.
  const tomorrow = (now.day + 1) % 7;
  const showMeal = status.meal ?? "breakfast";
  const showDay = status.meal ? now.day : tomorrow;
  const items = menu.grid[showDay]?.[showMeal] ?? [];
  const extras = menu.extras.filter((e) => e.meals.includes(showMeal));
  const time = menu.timings[showMeal];

  const headline = !status.meal
    ? `${mealName("breakfast")} tomorrow · ${formatClock(menu.timings.breakfast.start)}`
    : status.state === "now"
      ? `${mealName(showMeal)} now · till ${formatClock(time.end)}`
      : `${mealName(showMeal)} next · from ${formatClock(time.start)}`;

  const next = status.meal ? status.next : null;
  const nextItems = next ? (menu.grid[next.dayOffset ? tomorrow : now.day]?.[next.meal] ?? []) : [];
  const nextLine = nextItems.slice(0, 3).map((i) => t(i.name)).join(", ");

  return (
    <section aria-label="Today's menu" className="animate-slide-up rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-surface-accent text-accent-text"><UtensilsCrossed className="size-5" /></span>
          <div>
            <p className="eyebrow">Today&apos;s menu · {hiMode ? DAY_HI[now.day] : DAY_NAMES[now.day]}</p>
            <h2 className="text-lg font-extrabold tracking-tight text-text sm:text-xl">
              <span className={status.state === "now" ? "text-success-fg" : undefined}>{headline}</span>
            </h2>
            <p className="text-xs font-semibold text-text-muted">{messLabel}{!status.meal && ` · ${DAY_NAMES[tomorrow]}`}</p>
          </div>
        </div>
        <LangToggle lang={lang} onChange={choose} loading={loading} />
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-2 text-sm font-semibold text-text sm:grid-cols-2">
        {items.map((it, i) => (
          <li key={i}><ItemLine item={it} t={t} /></li>
        ))}
        {extras.map((e) => (
          <li key={e.name} className="inline-flex items-center gap-1.5 text-text-muted"><DietDot type="veg" /> {t(e.name)}</li>
        ))}
        {items.length === 0 && <li className="text-text-muted">No menu has been added for this meal yet.</li>}
      </ul>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
        <p className="min-w-0 text-text-muted">
          {next ? (
            <>
              <span className="font-bold text-text">Next: {mealName(next.meal)}</span> · {formatClock(menu.timings[next.meal].start)}
              {nextLine && <> — {nextLine}{nextItems.length > 3 ? "…" : ""}</>}
            </>
          ) : (
            "That was the last meal today."
          )}
        </p>
        <Link href="/hostel/mess" className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline">
          Full week <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
