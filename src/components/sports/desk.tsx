"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { AlertTriangle, ClipboardList, Eye, EyeOff, HandHelping, Loader2, PackageCheck, Pencil, Plus, Search, Ticket, Undo2, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SPORTS_CATEGORIES } from "@/config/sports";
import { formatDateTime } from "@/lib/format";
import { issueLoan, raiseDamageTicket, rejectReturnRequest, returnLoan, saveEquipmentItem, setItemActive, setItemRepair } from "@/lib/sports/actions";
import type { DeskData } from "@/lib/sports/core";
import { campusDate, formatClock, formatSlot, relativeTime } from "@/lib/sports/time";
import type { ItemWithAvailability, LoanView } from "@/lib/sports/types";
import { cn } from "@/lib/utils";
import { CategoryIcon, LoanStatusBadge } from "./sports-bits";

type Result = { ok: true } | { ok: false; error: string };

/** Runs a server action with a spinner, a toast and a refresh of the desk data. */
function useDeskAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  function run(key: string, action: () => Promise<Result>, success: string) {
    setBusyKey(key);
    start(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(success);
        router.refresh();
      } else toast.error(res.error);
      setBusyKey(null);
    });
  }
  return { run, busy: (key: string) => pending && busyKey === key };
}

function Section({ title, count, hint, children }: { title: string; count?: number; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-text">
          {title}
          {count != null && <span className="rounded-full bg-surface-accent-2 px-2 py-0.5 text-xs font-bold text-accent-text">{count}</span>}
        </h2>
        {hint && <p className="text-sm text-text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
      <p className="eyebrow">{label}</p>
      <p className={cn("mt-1 text-3xl font-extrabold tracking-tight tabular-nums", tone && value > 0 ? (tone === "danger" ? "text-danger-solid" : "text-warning-solid") : "text-text")}>{value}</p>
    </div>
  );
}

export function SportsDesk({ data, canManage }: { data: DeskData; canManage: boolean }) {
  const { run, busy } = useDeskAction();
  const [query, setQuery] = useState("");
  const [returning, setReturning] = useState<LoanView | null>(null);
  const [editing, setEditing] = useState<ItemWithAvailability | "new" | null>(null);

  const today = campusDate();
  const reservedToday = data.active.filter((l) => l.status === "reserved" && campusDate(new Date(l.reserved_for)) === today);
  const issued = data.active.filter((l) => l.status === "issued");
  const overdue = data.active.filter((l) => l.status === "overdue");
  const pendingReturns = data.active.filter((l) => l.status === "return_pending");
  const repairCount = data.items.filter((i) => i.under_repair).length;

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? data.active.filter((l) => (l.student_roll ?? "").toLowerCase().includes(q) || (l.pickup_code ?? "").toLowerCase() === q || (l.pickup_code ?? "").toLowerCase().includes(q) || (l.student_name ?? "").toLowerCase().includes(q))
        : [],
    [q, data.active],
  );

  const card = (l: LoanView) => (
    <LoanRow key={l.id} loan={l} canManage={canManage} busy={busy(`issue-${l.id}`)} onIssue={() => run(`issue-${l.id}`, () => issueLoan(l.id), "Issued")} onReturn={() => setReturning(l)} />
  );

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Reservations today" value={reservedToday.length} />
        <Stat label="Out right now" value={issued.length + overdue.length + pendingReturns.length} />
        <Stat label="Overdue" value={overdue.length} tone="danger" />
        <Stat label="Under repair" value={repairCount} tone="warning" />
      </div>

      {canManage && (
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5">
          <Label htmlFor="desk-search" className="eyebrow mb-2 block">Issue / return desk</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              id="desk-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Roll number or pickup code"
              autoComplete="off"
              autoCapitalize="characters"
              className="h-12 rounded-full pl-10 text-base"
            />
          </div>
          {q && (
            <div className="mt-4 space-y-3">
              {matches.length === 0 ? (
                <p className="rounded-2xl bg-surface-2 p-3 text-sm text-text-muted">No active reservation or loan matches “{query.trim()}”.</p>
              ) : (
                matches.map(card)
              )}
            </div>
          )}
        </div>
      )}

      {!q && (
        <>
          {pendingReturns.length > 0 && (
            <Section title="Returns to confirm" count={pendingReturns.length} hint="Students say these are back at the counter. Check, then confirm.">
              <div className="space-y-3">
                {pendingReturns.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-4 rounded-3xl border border-border bg-warning-bg p-4 text-warning-fg shadow-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold">{l.qty}× {l.item_name}</p>
                      <p className="text-sm">{l.student_name} · Roll {l.student_roll ?? "—"}</p>
                      {l.return_requested_at && <p className="text-xs">Marked returned {relativeTime(l.return_requested_at)}</p>}
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy(`good-${l.id}`)} onClick={() => run(`good-${l.id}`, () => returnLoan({ loanId: l.id, qty: l.qty, condition: "good" }), "Return confirmed")}>
                          {busy(`good-${l.id}`) ? <Loader2 className="animate-spin" /> : <PackageCheck />} Confirm · Good
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setReturning(l)}>
                          <AlertTriangle /> Damaged
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy(`rej-${l.id}`)} onClick={() => run(`rej-${l.id}`, () => rejectReturnRequest(l.id), "Sent back to Issued")}>
                          {busy(`rej-${l.id}`) ? <Loader2 className="animate-spin" /> : <XCircle />} Not received
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Today's reservations" count={reservedToday.length} hint="Not picked up within 30 minutes of the slot start, they are released automatically.">
            {reservedToday.length === 0 ? <EmptyState icon={ClipboardList} title="No reservations for today" className="py-8" /> : <div className="space-y-3">{reservedToday.map(card)}</div>}
          </Section>

          <Section title="Overdue" count={overdue.length}>
            {overdue.length === 0 ? <EmptyState icon={PackageCheck} title="Nothing overdue" description="Everything is back on time." className="py-8" /> : <div className="space-y-3">{overdue.map(card)}</div>}
          </Section>

          {issued.length > 0 && (
            <Section title="Out right now" count={issued.length}>
              <div className="space-y-3">{issued.map(card)}</div>
            </Section>
          )}

          {data.active.some((l) => l.status === "reserved" && !reservedToday.includes(l)) && (
            <Section title="Later reservations">
              <div className="space-y-3">{data.active.filter((l) => l.status === "reserved" && !reservedToday.includes(l)).map(card)}</div>
            </Section>
          )}

          {data.damagedNoTicket.length > 0 && (
            <Section title="Damaged returns without a ticket" count={data.damagedNoTicket.length}>
              <div className="space-y-3">
                {data.damagedNoTicket.map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-warning-bg p-4 text-warning-fg">
                    <div className="min-w-0 text-sm">
                      <p className="font-bold">{l.qty}× {l.item_name} · {l.student_name}</p>
                      {l.notes && <p>{l.notes}</p>}
                    </div>
                    {canManage && (
                      <Button size="sm" disabled={busy(`ticket-${l.id}`)} onClick={() => run(`ticket-${l.id}`, () => raiseDamageTicket(l.id), "Sports ticket created")}>
                        {busy(`ticket-${l.id}`) ? <Loader2 className="animate-spin" /> : <Ticket />} Create Sports ticket
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Inventory" count={data.items.length}>
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
                <Plus /> Add item
              </Button>
            )}
            <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface">
              {data.items.map((i) => (
                <li key={i.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !i.active && "opacity-60")}>
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-accent text-accent-text">
                    <CategoryIcon category={i.category} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-text">
                      {i.name}
                      {!i.active && <span className="ml-2 text-xs font-semibold text-text-muted">(hidden)</span>}
                    </p>
                    <p className="text-xs text-text-muted">
                      {i.category} · {i.available} of {i.total_qty} available
                      {i.condition_notes ? ` · ${i.condition_notes}` : ""}
                    </p>
                  </div>
                  {i.under_repair && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2.5 py-0.5 text-xs font-bold text-warning-fg">
                      <Wrench className="size-3" /> Under repair
                    </span>
                  )}
                  {canManage && (
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => setEditing(i)}><Pencil /> Edit</Button>
                      <Button variant="outline" size="sm" disabled={busy(`repair-${i.id}`)} onClick={() => run(`repair-${i.id}`, () => setItemRepair(i.id, !i.under_repair), i.under_repair ? "Back in service" : "Marked under repair")}>
                        <Wrench /> {i.under_repair ? "Back in service" : "Under repair"}
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={i.active ? `Hide ${i.name} from students` : `Show ${i.name} to students`} disabled={busy(`active-${i.id}`)} onClick={() => run(`active-${i.id}`, () => setItemActive(i.id, !i.active), i.active ? "Hidden from students" : "Visible to students")}>
                        {i.active ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {data.recentReturns.length > 0 && (
            <Section title="Recent returns">
              <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface text-sm">
                {data.recentReturns.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="font-semibold text-text">{l.qty}× {l.item_name} <span className="font-normal text-text-muted">· {l.student_name}</span></span>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      {l.return_condition === "damaged" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 font-bold text-warning-fg"><AlertTriangle className="size-3" /> Damaged</span>
                      )}
                      {l.ticket_no && (
                        <Link href={`/staff?t=${l.ticket_no}`} className="font-bold text-accent-text hover:underline">{l.ticket_no}</Link>
                      )}
                      {l.returned_at && formatDateTime(l.returned_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      <ReturnDialog loan={returning} onClose={() => setReturning(null)} />
      <ItemDialog item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function LoanRow({ loan, canManage, busy, onIssue, onReturn }: { loan: LoanView; canManage: boolean; busy: boolean; onIssue: () => void; onReturn: () => void }) {
  const out = loan.status === "issued" || loan.status === "overdue" || loan.status === "return_pending";
  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-3xl border bg-surface p-4 shadow-sm", loan.status === "overdue" ? "border-danger-solid" : "border-border")}>
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-accent text-accent-text">
        <CategoryIcon category={loan.item_category} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-text">{loan.qty}× {loan.item_name}</p>
        <p className="text-sm text-text-muted">
          {loan.student_name} · Roll {loan.student_roll ?? "—"}
        </p>
        <p className="text-xs text-text-muted">
          {out ? `Due ${formatClock(loan.due_at)} (${relativeTime(loan.due_at)})` : formatSlot(loan.reserved_for, loan.due_at)}
          {loan.pickup_code && !out && <span className="ml-2 font-mono font-bold tracking-widest text-text">{loan.pickup_code}</span>}
        </p>
      </div>
      <LoanStatusBadge status={loan.status} />
      {canManage &&
        (out ? (
          <Button onClick={onReturn}><Undo2 /> Return</Button>
        ) : (
          <Button onClick={onIssue} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <HandHelping />} Issue
          </Button>
        ))}
    </div>
  );
}

function ReturnDialog({ loan, onClose }: { loan: LoanView | null; onClose: () => void }) {
  const { run, busy } = useDeskAction();
  const [qty, setQty] = useState(1);
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [notes, setNotes] = useState("");
  const [raise, setRaise] = useState(true);
  const [lastId, setLastId] = useState<string | null>(null);

  // Reset the form each time a different loan is opened.
  if (loan && loan.id !== lastId) {
    setLastId(loan.id);
    setQty(loan.qty);
    setCondition("good");
    setNotes("");
    setRaise(true);
  }
  if (!loan && lastId) setLastId(null);

  function submit() {
    if (!loan) return;
    run(
      "return",
      async () => {
        const res = await returnLoan({ loanId: loan.id, qty, condition, notes, raiseTicket: condition === "damaged" && raise });
        if (res.ok) {
          onClose();
          if (res.ticketNo) toast.success(`Sports ticket ${res.ticketNo} created`);
        }
        return res;
      },
      "Return recorded",
    );
  }

  return (
    <Dialog open={!!loan} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        {loan && (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-extrabold">Take back {loan.item_name}</DialogTitle>
              <DialogDescription>
                {loan.student_name} · Roll {loan.student_roll ?? "—"} · {loan.qty} issued
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
              {loan.qty > 1 && (
                <div>
                  <p className="eyebrow mb-2">How many are you taking back?</p>
                  <div className="flex gap-2">
                    {Array.from({ length: loan.qty }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setQty(n)}
                        aria-pressed={qty === n}
                        className={cn("size-10 rounded-full border text-sm font-bold", qty === n ? "border-transparent bg-primary text-primary-fg" : "border-border bg-surface text-text hover:bg-surface-2")}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {qty < loan.qty && <p className="mt-1.5 text-xs text-text-muted">The other {loan.qty - qty} stay with the student; return them separately.</p>}
                </div>
              )}
              <div>
                <p className="eyebrow mb-2">Condition{loan.qty > 1 ? ` of the ${qty} returned` : ""}</p>
                <div className="inline-flex gap-1 rounded-full border border-border bg-surface p-1" role="group">
                  {(["good", "damaged"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCondition(c)}
                      aria-pressed={condition === c}
                      className={cn("rounded-full px-5 py-1.5 text-sm font-bold capitalize", condition === c ? (c === "damaged" ? "bg-danger-solid text-danger-solid-fg" : "bg-primary text-primary-fg") : "text-text-muted hover:bg-surface-2")}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="ret-notes" className="eyebrow mb-2 block">Notes {condition === "damaged" ? "(what is wrong?)" : "(optional)"}</Label>
                <Textarea id="ret-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} placeholder={condition === "damaged" ? "e.g. Frame bent, string snapped" : "Anything worth remembering"} />
              </div>
              {condition === "damaged" && (
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-warning-bg p-3 text-sm text-warning-fg">
                  <input type="checkbox" checked={raise} onChange={(e) => setRaise(e.target.checked)} className="mt-0.5 size-4" />
                  <span>
                    <span className="font-bold">Create a Sports ticket</span>
                    <br />
                    Sends it to Estate / Maintenance so it can be repaired or replaced.
                  </span>
                </label>
              )}
              <Button className="w-full" size="lg" disabled={busy("return")} onClick={submit}>
                {busy("return") && <Loader2 className="animate-spin" />} Confirm return
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemDialog({ item, onClose }: { item: ItemWithAvailability | "new" | null; onClose: () => void }) {
  const { run, busy } = useDeskAction();
  const existing = item && item !== "new" ? item : null;
  const key = item === "new" ? "new" : (existing?.id ?? "");
  const [form, setForm] = useState({ name: "", category: "Football" as string, total: "1", notes: "" });
  const [lastKey, setLastKey] = useState<string | null>(null);

  if (item && key !== lastKey) {
    setLastKey(key);
    setForm({ name: existing?.name ?? "", category: existing?.category ?? "Football", total: String(existing?.total_qty ?? 1), notes: existing?.condition_notes ?? "" });
  }
  if (!item && lastKey) setLastKey(null);

  function submit() {
    run(
      "item",
      async () => {
        const res = await saveEquipmentItem({
          id: existing?.id,
          name: form.name,
          category: form.category as (typeof SPORTS_CATEGORIES)[number],
          total_qty: Number(form.total),
          condition_notes: form.notes,
        });
        if (res.ok) onClose();
        return res;
      },
      existing ? "Item saved" : "Item added",
    );
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold">{existing ? `Edit ${existing.name}` : "Add equipment"}</DialogTitle>
          <DialogDescription>Quantities are the total you own, including items currently out.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="item-name" className="eyebrow mb-2 block">Name</Label>
            <Input id="item-name" value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Football (size 5)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="item-cat" className="eyebrow mb-2 block">Category</Label>
              <SimpleSelect id="item-cat" value={form.category} onChange={(v) => setForm({ ...form, category: v ?? "Other" })} options={SPORTS_CATEGORIES} placeholder="Category" />
            </div>
            <div>
              <Label htmlFor="item-qty" className="eyebrow mb-2 block">Total quantity</Label>
              <Input id="item-qty" type="number" inputMode="numeric" min={0} max={500} value={form.total} onChange={(e) => setForm({ ...form, total: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="item-notes" className="eyebrow mb-2 block">Condition notes (optional)</Label>
            <Input id="item-notes" value={form.notes} maxLength={300} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Two rackets have worn grips" />
          </div>
          <Button className="w-full" size="lg" disabled={busy("item") || form.name.trim().length < 2} onClick={submit}>
            {busy("item") && <Loader2 className="animate-spin" />} {existing ? "Save changes" : "Add item"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
