"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Clock, Loader2, Minus, PackageX, Plus, Search, Wrench } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SPORTS_CATEGORIES, SPORTS_MAX_ITEMS_PER_STUDENT, SPORTS_PICKUP_GRACE_MIN, SPORTS_SLOT_HOURS } from "@/config/sports";
import { formatDateTime } from "@/lib/format";
import { reserveEquipment } from "@/lib/sports/actions";
import { DAY_OPTIONS, formatClock, formatSlot, slotsFor, type SlotDay } from "@/lib/sports/time";
import type { ItemWithAvailability } from "@/lib/sports/types";
import { cn } from "@/lib/utils";
import { CategoryIcon, PickupCode, PickupQr } from "./sports-bits";

const REFRESH_MS = 20_000;

/** The student's equipment grid: live availability, category filter, search and the Reserve dialog. */
export function EquipmentBrowser({
  items,
  heldQty,
  blockedUntil,
}: {
  items: ItemWithAvailability[];
  /** How many items this student already holds (reserved + issued + overdue). */
  heldQty: number;
  blockedUntil: string | null;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ItemWithAvailability | null>(null);

  // Availability changes as other students reserve: re-read it every 20 seconds while the tab is open.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  const categories = useMemo(() => SPORTS_CATEGORIES.filter((c) => items.some((i) => i.category === c)), [items]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (!category || i.category === category) && (!q || `${i.name} ${i.category}`.toLowerCase().includes(q)));
  }, [items, category, query]);

  const room = Math.max(0, SPORTS_MAX_ITEMS_PER_STUDENT - heldQty);

  return (
    <div className="space-y-5">
      {blockedUntil && (
        <div role="status" className="flex items-start gap-3 rounded-3xl border border-border bg-warning-bg p-4 text-warning-fg">
          <Clock className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-bold">Reservations are paused for you</p>
            <p>
              Two returns were late in the last 30 days, so you can reserve again from {formatDateTime(blockedUntil)}. Returning on time keeps this from
              happening.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search equipment" aria-label="Search equipment" className="rounded-full pl-10" />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? "all"}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
                category === c ? "border-transparent bg-primary text-primary-fg" : "border-border bg-surface text-text-muted hover:bg-surface-2",
              )}
            >
              {c ?? "All"}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={PackageX} title="No equipment found" description="Try a different search or category." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const none = item.available === 0;
            const reservable = !item.under_repair && !none && !blockedUntil && room > 0;
            const pct = item.total_qty ? Math.round((item.available / item.total_qty) * 100) : 0;
            return (
              <li key={item.id} className="flex flex-col rounded-3xl border border-border bg-surface p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-accent text-accent-text">
                    <CategoryIcon category={item.category} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-extrabold tracking-tight text-text">{item.name}</h3>
                    <p className="eyebrow">{item.category}</p>
                  </div>
                </div>

                {item.under_repair ? (
                  <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full bg-warning-bg px-3 py-1 text-sm font-bold text-warning-fg">
                    <Wrench className="size-3.5" /> Under repair
                  </p>
                ) : (
                  <div className="mt-4">
                    <p className={cn("text-sm font-bold", none ? "text-text-muted" : "text-text")}>
                      {none ? `All ${item.total_qty} are out` : `${item.available} of ${item.total_qty} available`}
                    </p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                      <div className={cn("h-full rounded-full", none ? "bg-danger-solid" : pct <= 34 ? "bg-warning-solid" : "bg-success-solid")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
                {item.condition_notes && <p className="mt-3 text-xs text-text-muted">{item.condition_notes}</p>}

                <div className="mt-auto pt-4">
                  <Button className="w-full" onClick={() => setPicked(item)} disabled={!reservable}>
                    {reservable ? "Reserve" : item.under_repair ? "Unavailable" : none ? "None available" : blockedUntil ? "Paused" : "Limit reached"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ReserveDialog item={picked} maxQty={Math.min(room, picked?.available ?? 0)} onClose={() => setPicked(null)} />
    </div>
  );
}

function ReserveDialog({ item, maxQty, onClose }: { item: ItemWithAvailability | null; maxQty: number; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState(1);
  const [day, setDay] = useState<SlotDay>("today");
  const [hours, setHours] = useState<number>(1);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [done, setDone] = useState<{ code: string; slot: string; name: string; qty: number } | null>(null);
  // Slot list is derived from "now" when the dialog opens.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (item) {
      setNow(new Date());
      setQty(1);
      setStartHour(null);
      setDone(null);
    }
  }, [item]);

  const slots = useMemo(() => slotsFor(day, hours, now), [day, hours, now]);
  const chosen = slots.find((s) => s.startHour === startHour) ?? null;

  function submit() {
    if (!item || !chosen) return;
    start(async () => {
      const res = await reserveEquipment({ itemId: item.id, qty, day, startHour: chosen.startHour, hours });
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      setDone({ code: res.code, slot: formatSlot(chosen.start.toISOString(), chosen.end.toISOString()), name: item.name, qty });
      router.refresh();
    });
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        {done ? (
          <div className="flex flex-col items-center text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success-bg text-success-fg">
              <Check className="size-6" />
            </span>
            <DialogTitle className="mt-3 text-xl font-extrabold">Reserved!</DialogTitle>
            <DialogDescription className="mt-1">
              {done.qty}× {done.name} · {done.slot}
            </DialogDescription>
            <p className="eyebrow mt-5">Your pickup code</p>
            <PickupCode code={done.code} className="mt-1" />
            <div className="mt-4">
              <PickupQr code={done.code} />
            </div>
            <p className="mt-4 text-sm text-text-muted">
              Show this code at the Sports Complex counter. Collect within {SPORTS_PICKUP_GRACE_MIN} minutes of your slot starting, or it is released.
              You can find it again under “My equipment”.
            </p>
            <Button className="mt-5 w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          item && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-extrabold">Reserve {item.name}</DialogTitle>
                <DialogDescription>
                  {item.available} of {item.total_qty} available. You can hold up to {SPORTS_MAX_ITEMS_PER_STUDENT} items at a time.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div>
                  <p className="eyebrow mb-2">Quantity</p>
                  <div className="inline-flex items-center gap-3 rounded-full border border-border bg-surface p-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="One less" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>
                      <Minus />
                    </Button>
                    <span className="min-w-6 text-center font-bold tabular-nums text-text" aria-live="polite">{qty}</span>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="One more" disabled={qty >= maxQty} onClick={() => setQty(qty + 1)}>
                      <Plus />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="eyebrow mb-2">Day</p>
                  <Segmented
                    value={day}
                    onChange={(v) => {
                      setDay(v as SlotDay);
                      setStartHour(null);
                    }}
                    options={DAY_OPTIONS.map((d) => ({ value: d.value, label: d.label }))}
                  />
                </div>

                <div>
                  <p className="eyebrow mb-2">For how long</p>
                  <Segmented
                    value={String(hours)}
                    onChange={(v) => {
                      setHours(Number(v));
                      setStartHour(null);
                    }}
                    options={SPORTS_SLOT_HOURS.map((h) => ({ value: String(h), label: `${h} hour${h > 1 ? "s" : ""}` }))}
                  />
                </div>

                <div>
                  <p className="eyebrow mb-2">Start time</p>
                  {slots.length === 0 ? (
                    <p className="rounded-2xl bg-surface-2 p-3 text-sm text-text-muted">
                      No slots left {day === "today" ? "today" : "that day"} — try {day === "today" ? "tomorrow" : "a shorter slot"}.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Start time">
                      {slots.map((s) => (
                        <button
                          key={s.startHour}
                          type="button"
                          onClick={() => setStartHour(s.startHour)}
                          aria-pressed={startHour === s.startHour}
                          className={cn(
                            "rounded-xl border px-2 py-2 text-sm font-semibold transition-colors",
                            startHour === s.startHour ? "border-transparent bg-primary text-primary-fg" : "border-border bg-surface text-text hover:bg-surface-2",
                          )}
                        >
                          {formatClock(s.start.toISOString())}
                        </button>
                      ))}
                    </div>
                  )}
                  {chosen && (
                    <p className="mt-2 text-xs text-text-muted">
                      Return by {formatClock(chosen.end.toISOString())}. Late returns count against you.
                    </p>
                  )}
                </div>

                <Button className="w-full" size="lg" disabled={!chosen || pending} onClick={submit}>
                  {pending && <Loader2 className="animate-spin" />} Reserve {qty > 1 ? `${qty} items` : "it"}
                </Button>
              </div>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="inline-flex gap-1 rounded-full border border-border bg-surface p-1" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-bold transition-colors",
            value === o.value ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
