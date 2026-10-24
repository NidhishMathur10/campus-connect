"use client";

import { useRef, useState, useTransition } from "react";
import { ImageUp, Loader2, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DAY_NAMES, DAY_SHORT, MEAL_LABELS, MEALS, type DietType, type Meal, type MenuItem, type Timings } from "@/config/mess";
import { compressImage } from "@/lib/image";
import { saveMenu } from "@/lib/mess/actions";
import type { MenuData } from "@/lib/mess/types";
import type { ImportMenuResponse } from "@/app/api/mess/import/route";
import { cn } from "@/lib/utils";
import { DietDot } from "./diet";

type Grid = Record<Meal, MenuItem[]>[];

const NEXT_TYPE: Record<DietType, DietType> = { veg: "nonveg", nonveg: "veg", either: "veg" };

/** A diet-dot button: tap to flip veg <-> non-veg. */
function DietToggle({ type, onChange, label }: { type: DietType; onChange: (t: DietType) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(NEXT_TYPE[type])}
      aria-label={`${label}: ${type === "veg" ? "vegetarian" : "non-vegetarian"}. Tap to change`}
      title="Tap to switch veg / non-veg"
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-border bg-surface-2 hover:border-accent-blue"
    >
      <DietDot type={type} className="size-4" />
    </button>
  );
}

/** Edit the shared weekly menu, serving times, daily extras and footer; or fill it from a photo of the printed chart. */
export function MenuEditor({ menu }: { menu: MenuData }) {
  const [grid, setGrid] = useState<Grid>(() => structuredClone(menu.grid));
  const [timings, setTimings] = useState<Timings>(menu.timings);
  const [extras, setExtras] = useState<string[]>(menu.extras.map((e) => e.name));
  const [footer, setFooter] = useState(menu.footer);
  const [day, setDay] = useState(0);
  const [pending, start] = useTransition();
  const [reading, setReading] = useState(false);
  const [imported, setImported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const patchItem = (m: Meal, i: number, patch: Partial<MenuItem> | null) =>
    setGrid((g) => g.map((d, di) => (di !== day ? d : { ...d, [m]: patch === null ? d[m].filter((_, k) => k !== i) : d[m].map((it, k) => (k === i ? { ...it, ...patch } : it)) })));
  const addItem = (m: Meal) => setGrid((g) => g.map((d, di) => (di !== day ? d : { ...d, [m]: [...d[m], { name: "", type: "veg" as DietType }] })));

  async function importPhoto(file: File | undefined) {
    if (!file) return;
    setReading(true);
    try {
      const blob = await compressImage(file, 3_000_000);
      const body = new FormData();
      body.append("photo", blob, "menu.jpg");
      const res = (await (await fetch("/api/mess/import", { method: "POST", body })).json()) as ImportMenuResponse;
      if (!res.ok) return void toast.error(res.error);
      setGrid(res.grid);
      if (res.extras.length) setExtras(res.extras);
      if (res.footer) setFooter(res.footer);
      setImported(true);
      toast.success(`Read ${res.cells} meals from the photo. Review them, then save.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that photo.");
    } finally {
      setReading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    const clean = grid.map((d) =>
      Object.fromEntries(MEALS.map((m) => [m, d[m].filter((i) => i.name.trim()).map((i) => (i.alt?.trim() ? { ...i, alt: i.alt.trim() } : { name: i.name, type: i.type }))])) as Record<Meal, MenuItem[]>,
    );
    start(async () => {
      const res = await saveMenu({ grid: clean, extras: extras.filter((e) => e.trim()), footer, timings });
      if (res.ok) {
        setImported(false);
        toast.success("Menu saved. Students see it now.");
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      {/* Import */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-surface-accent p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-extrabold text-text"><Sparkles className="size-4 text-accent-text" /> Upload menu photo</p>
          <p className="text-sm text-text-muted">Take a straight-on photo of the printed chart. The AI fills the grid below; nothing is saved until you press Save.</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => importPhoto(e.target.files?.[0])} aria-label="Menu photo" />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={reading || pending}>
          {reading ? <Loader2 className="animate-spin" /> : <ImageUp />} {reading ? "Reading the chart…" : "Choose photo"}
        </Button>
      </div>
      {imported && (
        <p role="status" className="rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
          Imported from the photo — check every day for mistakes (dish names, veg / non-veg), then press Save.
        </p>
      )}

      {/* Day tabs */}
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 sm:w-fit">
        {DAY_SHORT.map((d, i) => (
          <button key={d} role="tab" aria-selected={day === i} onClick={() => setDay(i)} className={cn("rounded-full px-4 py-1.5 text-sm font-bold whitespace-nowrap", day === i ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2")}>
            {d}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {MEALS.map((m) => (
          <section key={m} className="space-y-3 rounded-3xl border border-border bg-surface p-4 shadow-sm" aria-label={`${DAY_NAMES[day]} ${MEAL_LABELS[m]}`}>
            <h3 className="font-extrabold text-text">{DAY_NAMES[day]} · {MEAL_LABELS[m]}</h3>
            <ul className="space-y-2">
              {grid[day][m].map((it, i) => (
                <li key={i} className="space-y-1.5 rounded-2xl bg-surface-2 p-2">
                  <div className="flex items-center gap-2">
                    <DietToggle type={it.type} label={it.name || "Dish"} onChange={(t) => patchItem(m, i, { type: t })} />
                    <Input value={it.name} onChange={(e) => patchItem(m, i, { name: e.target.value })} placeholder="Dish name" aria-label="Dish name" maxLength={80} />
                    <Button type="button" size="icon" variant="ghost" aria-label="Remove dish" onClick={() => patchItem(m, i, null)}><Trash2 /></Button>
                  </div>
                  {it.alt !== undefined ? (
                    <div className="flex items-center gap-2 pl-4">
                      <span className="text-text-muted">/</span>
                      <DietToggle type={it.alt_type ?? "veg"} label={it.alt || "Alternative"} onChange={(t) => patchItem(m, i, { alt_type: t })} />
                      <Input value={it.alt} onChange={(e) => patchItem(m, i, { alt: e.target.value })} placeholder="Or choose…" aria-label="Alternative dish" maxLength={80} />
                      <Button type="button" size="icon" variant="ghost" aria-label="Remove alternative" onClick={() => patchItem(m, i, { alt: undefined, alt_type: undefined })}><X /></Button>
                    </div>
                  ) : (
                    <button type="button" className="pl-4 text-xs font-bold text-accent-text hover:underline" onClick={() => patchItem(m, i, { alt: "", alt_type: "veg" })}>+ Add “or choose” alternative</button>
                  )}
                </li>
              ))}
              {grid[day][m].length === 0 && <li className="text-sm text-text-muted">No dishes yet.</li>}
            </ul>
            <Button type="button" size="sm" variant="outline" onClick={() => addItem(m)}><Plus /> Add dish</Button>
          </section>
        ))}
      </div>

      {/* Timings */}
      <section className="space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm">
        <h3 className="font-extrabold text-text">Serving times</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MEALS.map((m) => (
            <div key={m} className="space-y-1.5">
              <Label className="eyebrow">{MEAL_LABELS[m]}</Label>
              <div className="flex items-center gap-2">
                <Input type="time" aria-label={`${MEAL_LABELS[m]} start`} value={timings[m].start} onChange={(e) => setTimings((t) => ({ ...t, [m]: { ...t[m], start: e.target.value } }))} />
                <span className="text-text-muted">–</span>
                <Input type="time" aria-label={`${MEAL_LABELS[m]} end`} value={timings[m].end} onChange={(e) => setTimings((t) => ({ ...t, [m]: { ...t[m], end: e.target.value } }))} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Extras + footer */}
      <section className="grid gap-4 rounded-3xl border border-border bg-surface p-5 shadow-sm md:grid-cols-2">
        <div className="space-y-2">
          <Label className="eyebrow" htmlFor="extras">Served every day with all meals</Label>
          <Input id="extras" value={extras.join(", ")} onChange={(e) => setExtras(e.target.value.split(",").map((x) => x.trimStart()))} placeholder="Pickles, …" />
          <p className="text-xs text-text-muted">Separate with commas.</p>
        </div>
        <div className="space-y-2">
          <Label className="eyebrow" htmlFor="footer">Footer note</Label>
          <Textarea id="footer" value={footer} onChange={(e) => setFooter(e.target.value)} className="min-h-20" maxLength={500} />
        </div>
      </section>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="button" size="lg" className="shadow-float" onClick={save} disabled={pending || reading}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save menu
        </Button>
      </div>
    </div>
  );
}
