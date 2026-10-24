"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlarmClock, ChevronDown, Hourglass, Loader2, PackageCheck, QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SPORTS_PICKUP_GRACE_MIN } from "@/config/sports";
import { formatDateTime } from "@/lib/format";
import { cancelReservation, requestReturn } from "@/lib/sports/actions";
import { formatClock, formatSlot, relativeTime } from "@/lib/sports/time";
import type { LoanView } from "@/lib/sports/types";
import { cn } from "@/lib/utils";
import { CategoryIcon, LoanStatusBadge, PickupCode, PickupQr } from "./sports-bits";

/** The student's own loans: what they hold now (with due times and pickup codes) and a short history. */
export function MyEquipment({ loans }: { loans: LoanView[] }) {
  const [showHistory, setShowHistory] = useState(false);
  const current = loans.filter((l) => l.status === "reserved" || l.status === "issued" || l.status === "overdue" || l.status === "return_pending");
  const history = loans.filter((l) => !current.includes(l));

  return (
    <section aria-labelledby="my-equipment" className="space-y-3">
      <h2 id="my-equipment" className="text-lg font-extrabold tracking-tight text-text">My equipment</h2>
      {current.length === 0 ? (
        <EmptyState icon={AlarmClock} title="Nothing reserved" description="Reserve something from the list above and your pickup code will show up here." className="py-10" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {current.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text"
          >
            <ChevronDown className={cn("size-4 transition-transform", showHistory && "rotate-180")} /> Earlier ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-2 divide-y divide-border rounded-3xl border border-border bg-surface">
              {history.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 truncate font-semibold text-text">
                    {l.qty}× {l.item_name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-text-muted sm:inline">{formatDateTime(l.returned_at ?? l.reserved_for)}</span>
                    <LoanStatusBadge status={l.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function LoanCard({ loan }: { loan: LoanView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showCode, setShowCode] = useState(loan.status === "reserved");
  const overdue = loan.status === "overdue";
  const [confirming, setConfirming] = useState(false);

  function markReturned() {
    start(async () => {
      const res = await requestReturn(loan.id);
      if (res.ok) {
        toast.success("Sent to the Sports in-charge for confirmation");
        setConfirming(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function cancel() {
    start(async () => {
      const res = await cancelReservation(loan.id);
      if (res.ok) {
        toast.success("Reservation cancelled");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <li className={cn("rounded-3xl border bg-surface p-5 shadow-sm", overdue ? "border-danger-solid" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-accent text-accent-text">
            <CategoryIcon category={loan.item_category} className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-extrabold text-text">
              {loan.qty}× {loan.item_name}
            </p>
            <p className="text-xs text-text-muted">{formatSlot(loan.reserved_for, loan.due_at)}</p>
          </div>
        </div>
        <LoanStatusBadge status={loan.status} />
      </div>

      {loan.status === "reserved" && (
        <p className="mt-3 text-sm text-text-muted">
          Collect within {SPORTS_PICKUP_GRACE_MIN} min of the slot starting ({formatClock(loan.reserved_for)}).
        </p>
      )}
      {(loan.status === "issued" || overdue) && (
        <p className={cn("mt-3 flex items-center gap-1.5 text-sm font-bold", overdue ? "text-text" : "text-text-muted")}>
          <AlarmClock className="size-4" />
          {overdue ? `Overdue — was due ${formatClock(loan.due_at)} (${relativeTime(loan.due_at)})` : `Return by ${formatClock(loan.due_at)} (${relativeTime(loan.due_at)})`}
        </p>
      )}

      {loan.status === "return_pending" && (
        <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
          <Hourglass className="mt-0.5 size-4 shrink-0" />
          Return pending — waiting for the Sports in-charge to confirm
        </p>
      )}
      {(loan.status === "issued" || overdue) && (
        <>
          <Button variant="outline" className="mt-4 w-full" onClick={() => setConfirming(true)}>
            <PackageCheck /> I&apos;ve returned it
          </Button>
          <Dialog open={confirming} onOpenChange={setConfirming}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-xl font-extrabold">Returned at the Sports Complex counter?</DialogTitle>
                <DialogDescription>
                  Only say yes if you have handed {loan.qty}× {loan.item_name} back. The Sports in-charge will confirm it.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>Not yet</Button>
                <Button onClick={markReturned} disabled={pending}>
                  {pending && <Loader2 className="animate-spin" />} Yes, I returned it
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {loan.status === "reserved" && loan.pickup_code && (
        <div className="mt-4">
          {showCode ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 p-4">
              <p className="eyebrow">Pickup code</p>
              <PickupCode code={loan.pickup_code} className="text-3xl" />
              <PickupQr code={loan.pickup_code} size={144} />
            </div>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setShowCode(true)}>
              <QrCode /> Show pickup code
            </Button>
          )}
          <Button variant="ghost" size="sm" className="mt-2 w-full" disabled={pending} onClick={cancel}>
            {pending ? <Loader2 className="animate-spin" /> : <X />} Cancel reservation
          </Button>
        </div>
      )}
    </li>
  );
}
