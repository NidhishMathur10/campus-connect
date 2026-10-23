"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Copy, Lock, PartyPopper, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function SuccessCard({
  ticketNo,
  followed,
  confidential = false,
  trackBase = "/tickets",
  onReportAnother,
}: {
  ticketNo: string;
  /** True when the student joined an existing ticket with "Me too". */
  followed: boolean;
  /** Safety & Security report (no public tracking). */
  confidential?: boolean;
  /** Where "Track this ticket" goes ("/tickets" for students, "/reports" for faculty). */
  trackBase?: string;
  onReportAnother: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(ticketNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — please note the number down.");
    }
  }

  return (
    <div className="animate-slide-up overflow-hidden rounded-3xl bg-surface-inverse p-7 text-center text-text-inverse shadow-xl sm:p-10">
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-text-inverse/10">
        {followed ? <Users className="size-8 text-info-on-inverse" /> : <PartyPopper className="size-8 text-info-on-inverse" />}
      </div>
      <p className="eyebrow mt-5 text-info-on-inverse">{followed ? "You're following" : "Ticket created"}</p>
      <p className="mt-2 font-mono text-5xl font-extrabold tracking-tight sm:text-6xl">{ticketNo}</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-text-inverse-muted">
        {followed
          ? `You've been added to this ticket. Every update will show up in ${trackBase === "/reports" ? "My Reports" : "My Tickets"}.`
          : confidential
            ? "Your report has reached the right people. Only they and the Dean can see it — follow its progress in My Tickets."
            : "Your complaint has been sent to the right team. Keep this number — you can also track it from the login page without logging in."}
      </p>
      {confidential && (
        <p className="mx-auto mt-3 flex max-w-md items-center justify-center gap-1.5 text-xs font-semibold text-info-on-inverse">
          <Lock className="size-3.5" /> Safety reports are never shown in public tracking.
        </p>
      )}
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        <Button size="lg" variant="secondary" onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy number"}
        </Button>
        <Button size="lg" className="bg-surface text-text hover:bg-surface-accent" asChild>
          <Link href={`${trackBase}/${ticketNo}`}>
            Track this ticket <ArrowRight />
          </Link>
        </Button>
      </div>
      <button
        type="button"
        onClick={onReportAnother}
        className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-text-inverse-muted hover:text-text-inverse"
      >
        <Plus className="size-4" /> Report another problem
      </button>
    </div>
  );
}
