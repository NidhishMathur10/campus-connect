"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, EyeOff, Loader2, Lock, MessageSquarePlus, Siren, UserSearch } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Role } from "@/config/roles";
import { acknowledgeConcern, escalateConcernManually, revealIdentity, updateConcern } from "@/lib/concerns/actions";
import type { ConcernDetail } from "@/lib/concerns/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** HOD / Dean actions on one concern. The reporter is always "Anonymous student"; only the Dean can open the identity. */
export function ConcernActions({ concern, role }: { concern: ConcernDetail; role: Role }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(true);
  const closed = concern.status === "Closed";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) {
    start(async () => {
      const res = await fn();
      if (!res.ok) return void toast.error(res.error ?? "Something went wrong.");
      toast.success(success);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <p className="eyebrow">Actions</p>
      <div className="flex flex-wrap gap-2">
        {!concern.acknowledged_at && !closed && (
          <Button onClick={() => run(() => acknowledgeConcern(concern.ticket_no), "Acknowledged. The student was told.")} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Acknowledge
          </Button>
        )}
        {role === "hod" && !concern.escalated_at && !closed && (
          <Button variant="outline" onClick={() => run(() => escalateConcernManually(concern.ticket_no), "Escalated to the Dean.")} disabled={pending}>
            <Siren /> Escalate to Dean
          </Button>
        )}
        {role === "dean" && <RevealButton ticketNo={concern.ticket_no} />}
      </div>

      {!closed && (
        <div className="space-y-3">
          <Label htmlFor="cn-note" className="eyebrow">Add a note</Label>
          <Textarea id="cn-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done, or what the student should know…" className="min-h-24" maxLength={1500} disabled={pending} />
          <label className="flex items-center gap-2 text-sm font-semibold text-text">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="size-4 accent-primary" />
            The student can read this note
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={pending || note.trim().length < 3}
              onClick={() => run(() => updateConcern({ ticketNo: concern.ticket_no, note, visibleToStudent: visible }), "Note added.", () => setNote(""))}
            >
              <MessageSquarePlus /> Add note
            </Button>
            <Button
              disabled={pending || note.trim().length < 3 || !visible}
              title={visible ? undefined : "Closing needs a note the student can read"}
              onClick={() => run(() => updateConcern({ ticketNo: concern.ticket_no, note, visibleToStudent: true, close: true }), "Concern closed.", () => setNote(""))}
            >
              <CheckCircle2 /> Close with this outcome
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Dean only: type a reason, see the identity once, and it is written to the audit log. */
function RevealButton({ ticketNo }: { ticketNo: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<{ name: string; rollNo: string | null } | null>(null);

  function close() {
    setOpen(false);
    setReason("");
    setError(null);
    setShown(null); // shown once: closing the dialog forgets it
  }

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const res = await revealIdentity(ticketNo, reason);
      if (!res.ok) return setError(res.error);
      setShown({ name: res.name, rollNo: res.rollNo });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <UserSearch /> Reveal identity for investigation
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{shown ? "Reporter identity" : "Reveal identity for investigation"}</DialogTitle>
            <DialogDescription>
              {shown
                ? "This is shown once. It has been written to the audit log."
                : "Use this only for a formal investigation. Your reason, name and the time are recorded in the audit log that the Dean can review."}
            </DialogDescription>
          </DialogHeader>
          {shown ? (
            <div className="rounded-2xl border border-warning-fg/30 bg-warning-bg p-4 text-warning-fg">
              <p className="text-lg font-extrabold">{shown.name}</p>
              {shown.rollNo && <p className="text-sm font-semibold">Roll number {shown.rollNo}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="reveal-reason" className="eyebrow">Reason (required)</Label>
              <Textarea id="reveal-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does the investigation need the reporter's identity?" className="min-h-28" maxLength={1000} disabled={busy} />
              {error && <p role="alert" className="text-sm font-semibold text-danger-fg">{error}</p>}
            </div>
          )}
          <DialogFooter>
            {shown ? (
              <Button onClick={close}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
                <Button onClick={reveal} disabled={busy || reason.trim().length < 15}>
                  {busy ? <Loader2 className="animate-spin" /> : <EyeOff />} Reveal once and log it
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Read-only summary + timeline (server data, no hooks needed beyond this file's client boundary). */
export function ConcernTimeline({ events }: { events: ConcernDetail["events"] }) {
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className={cn("rounded-2xl border p-3", e.is_internal ? "border-dashed border-border bg-surface-2" : "border-border bg-surface")}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
            <span className="font-bold text-text">{e.actor_name ?? "CampusConnect"}</span>
            {e.to_status && <StatusBadge status={e.to_status} />}
            {e.is_internal && <span className="inline-flex items-center gap-1 rounded-full bg-neutral-bg px-2 py-0.5 font-bold text-neutral-fg"><Lock className="size-3" /> Internal</span>}
            <span className="ml-auto">{formatDateTime(e.created_at)}</span>
          </div>
          {e.note && <p className="mt-1.5 text-sm whitespace-pre-line text-text">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
