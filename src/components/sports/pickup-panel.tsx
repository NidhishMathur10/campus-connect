"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, HandHelping, Keyboard, Loader2, ScanLine, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizePickupCode, PICKUP_CODE_LENGTH } from "@/config/sports";
import { formatDateTime, timeAgo } from "@/lib/format";
import { issueLoan, lookupPickupCode, returnLoan } from "@/lib/sports/actions";
import type { PickupLookup } from "@/lib/sports/core";
import { formatSlot } from "@/lib/sports/time";
import { cn } from "@/lib/utils";
import { QrScanner } from "./qr-scanner";
import { CategoryIcon, LoanStatusBadge } from "./sports-bits";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

const ACTION_LABEL: Record<string, string> = {
  scan: "Scanned",
  issue: "Issued",
  return: "Return confirmed",
  return_rejected: "Return not received",
  lookup_failed: "Lookup failed",
};

type Done = { kind: "issued" | "returned"; text: string };

/** "Scan QR" + "Enter pickup code" at the top of the desk, and the verification card both lead to. */
export function PickupPanel() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [lookup, setLookup] = useState<PickupLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function find(raw: string) {
    setError(null);
    setScanning(false);
    start(async () => {
      const res = await lookupPickupCode(raw);
      if (res.ok) setLookup(res.result);
      else setError(res.error);
    });
  }

  function closeCard() {
    setLookup(null);
    setCode("");
    router.refresh();
  }

  const ready = normalizePickupCode(code) !== null;

  return (
    <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5">
      <Label htmlFor="pickup-code" className="eyebrow mb-3 block">Scan or enter a pickup code</Label>
      <Button size="lg" className="h-14 w-full text-base" onClick={() => { setError(null); setScanning(true); }}>
        <ScanLine className="size-5" /> Scan QR
      </Button>

      <div className="my-4 flex items-center gap-3 text-xs font-semibold text-text-muted">
        <span className="h-px flex-1 bg-border" /> or type the code <span className="h-px flex-1 bg-border" />
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) find(code);
        }}
      >
        <Input
          id="pickup-code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\s+/g, "").toUpperCase().slice(0, PICKUP_CODE_LENGTH))}
          placeholder="K7M2QX"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={PICKUP_CODE_LENGTH + 4}
          aria-describedby={error ? "pickup-error" : undefined}
          className="h-14 flex-1 rounded-full text-center font-mono text-2xl font-extrabold tracking-[0.3em] uppercase"
        />
        <Button type="submit" size="lg" className="h-14 px-6" disabled={!ready || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Keyboard />} Find
        </Button>
      </form>
      {error && (
        <p id="pickup-error" role="alert" className="mt-3 rounded-2xl bg-danger-bg p-3 text-sm font-semibold text-danger-fg">
          {error}
        </p>
      )}

      <Dialog open={scanning} onOpenChange={setScanning}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-extrabold">Scan the pickup QR</DialogTitle>
            <DialogDescription>Works for pickups and returns. The QR only holds the pickup code.</DialogDescription>
          </DialogHeader>
          {scanning && (
            <QrScanner
              onCode={(c) => {
                setCode(c);
                find(c);
              }}
              onManual={() => {
                setScanning(false);
                setTimeout(() => document.getElementById("pickup-code")?.focus(), 150);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!lookup} onOpenChange={(o) => !o && closeCard()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">{lookup && <VerificationCard lookup={lookup} onClose={closeCard} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function VerificationCard({ lookup, onClose }: { lookup: PickupLookup; onClose: () => void }) {
  const { loan, warnings, canIssue, canReturn, log } = lookup;
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Done | null>(null);
  const [condition, setCondition] = useState<"good" | "damaged">("good");
  const [notes, setNotes] = useState("");
  const [raise, setRaise] = useState(true);
  const name = loan.student_name ?? "Student";

  function issue() {
    start(async () => {
      const res = await issueLoan(loan.id);
      if (res.ok) setDone({ kind: "issued", text: `${loan.qty}× ${loan.item_name} issued to ${name}` });
      else toast.error(res.error);
    });
  }

  function confirmReturn() {
    start(async () => {
      const res = await returnLoan({ loanId: loan.id, qty: loan.qty, condition, notes, raiseTicket: condition === "damaged" && raise });
      if (res.ok) {
        setDone({ kind: "returned", text: `${loan.qty}× ${loan.item_name} returned${condition === "damaged" ? " (damaged)" : ""}${res.ticketNo ? ` · ticket ${res.ticketNo}` : ""}` });
      } else toast.error(res.error);
    });
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <DialogTitle className="sr-only">{done.kind === "issued" ? "Issued" : "Return confirmed"}</DialogTitle>
        <span className="grid size-20 animate-in place-items-center rounded-full bg-success-bg text-success-fg duration-500 zoom-in-50">
          <Check className="size-10" strokeWidth={3} />
        </span>
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-text">{done.kind === "issued" ? "Issued ✓" : "Return confirmed ✓"}</p>
          <p className="mt-1 text-sm text-text-muted">{done.text}. {name.split(" ")[0]} has been notified.</p>
        </div>
        <Button size="lg" className="w-full" onClick={onClose}>Done</Button>
      </div>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl font-extrabold">Verify pickup code</DialogTitle>
        <DialogDescription>Check this matches the person in front of you.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary text-lg font-extrabold text-primary-fg" aria-hidden>
            {initials(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold text-text">{name}</p>
            <p className="text-sm text-text-muted">Roll {loan.student_roll ?? "—"}</p>
          </div>
          <span className="ml-auto"><LoanStatusBadge status={loan.status} /></span>
        </div>

        <div className="space-y-2 rounded-2xl bg-surface-2 p-4">
          <p className="flex items-center gap-2 font-extrabold text-text">
            <span className="grid size-9 place-items-center rounded-xl bg-surface-accent text-accent-text"><CategoryIcon category={loan.item_category} className="size-4" /></span>
            {loan.qty}× {loan.item_name}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-text-muted"><Clock className="size-4" /> {formatSlot(loan.reserved_for, loan.due_at)}</p>
        </div>

        {warnings.map((w) => (
          <p
            key={w.text}
            role="alert"
            className={cn("flex items-start gap-2 rounded-2xl p-3 text-sm font-semibold", w.level === "danger" ? "bg-danger-bg text-danger-fg" : "bg-warning-bg text-warning-fg")}
          >
            {w.level === "danger" ? <ShieldAlert className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            {w.text}
          </p>
        ))}

        {canIssue && (
          <Button size="lg" className="h-14 w-full text-base" disabled={pending} onClick={issue}>
            {pending ? <Loader2 className="animate-spin" /> : <HandHelping className="size-5" />} Issue now
          </Button>
        )}

        {canReturn && (
          <div className="space-y-3">
            <div>
              <p className="eyebrow mb-2">Condition</p>
              <div className="inline-flex gap-1 rounded-full border border-border bg-surface p-1" role="group">
                {(["good", "damaged"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCondition(c)}
                    aria-pressed={condition === c}
                    className={cn("rounded-full px-6 py-2 text-sm font-bold capitalize", condition === c ? (c === "damaged" ? "bg-danger-solid text-danger-solid-fg" : "bg-primary text-primary-fg") : "text-text-muted hover:bg-surface-2")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            {condition === "damaged" && (
              <>
                <div>
                  <Label htmlFor="scan-ret-notes" className="eyebrow mb-2 block">What is wrong?</Label>
                  <Textarea id="scan-ret-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Frame bent, string snapped" />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-warning-bg p-3 text-sm text-warning-fg">
                  <input type="checkbox" checked={raise} onChange={(e) => setRaise(e.target.checked)} className="mt-0.5 size-4" />
                  <span><span className="font-bold">Create a Sports repair ticket</span><br />Sends it to Estate / Maintenance.</span>
                </label>
              </>
            )}
            <Button size="lg" className="h-14 w-full text-base" disabled={pending} onClick={confirmReturn}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="size-5" />} Confirm return
            </Button>
          </div>
        )}

        {!canIssue && !canReturn && (
          <Button variant="outline" size="lg" className="w-full" onClick={onClose}>Close</Button>
        )}

        {log.length > 0 && (
          <div>
            <p className="eyebrow mb-1.5">History</p>
            <ul className="space-y-1 text-xs text-text-muted">
              {log.map((l, i) => (
                <li key={i}>
                  <span className="font-semibold text-text">{ACTION_LABEL[l.action] ?? l.action}</span> by {l.actor_name} · {timeAgo(l.created_at)}
                  <span className="sr-only"> ({formatDateTime(l.created_at)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
