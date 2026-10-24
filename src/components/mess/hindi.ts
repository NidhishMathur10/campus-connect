"use client";

import { useCallback, useState, useTransition } from "react";
import type { MenuData } from "@/lib/mess/types";
import { getDishHindi } from "@/lib/mess/actions";

export const MEAL_HI = { breakfast: "नाश्ता", lunch: "दोपहर का भोजन", snacks: "स्नैक्स", dinner: "रात का खाना" } as const;
export const DAY_HI = ["सोमवार", "मंगलवार", "बुधवार", "बृहस्पतिवार", "शुक्रवार", "शनिवार", "रविवार"] as const;

export function menuNames(menu: MenuData): string[] {
  const names = new Set<string>(menu.extras.map((e) => e.name));
  for (const day of menu.grid) for (const items of Object.values(day)) for (const i of items) { names.add(i.name); if (i.alt) names.add(i.alt); }
  return [...names];
}

/** English / हिन्दी switch; dish names come from the cached Gemini transliterations, fetched on first use. */
export function useDishLanguage(menu: MenuData) {
  const [lang, setLang] = useState<"en" | "hi">("en");
  const [hi, setHi] = useState<Record<string, string>>({});
  const [loading, start] = useTransition();

  const choose = useCallback(
    (next: "en" | "hi") => {
      setLang(next);
      if (next === "hi" && Object.keys(hi).length === 0) start(async () => setHi(await getDishHindi(menuNames(menu))));
    },
    [hi, menu],
  );
  const t = useCallback((name: string) => (lang === "hi" ? (hi[name] ?? name) : name), [lang, hi]);
  return { lang, choose, t, loading };
}
