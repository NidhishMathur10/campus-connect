"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** "Ticket CC-1043 · PIN K7Q2" with a copy button (for tracking from the login page). */
export function PinChip({ ticketNo, pin, className }: { ticketNo: string; pin: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${ticketNo} · PIN ${pin}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — please note the number and PIN down.");
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">
        <KeyRound className="size-4 text-accent-blue" />
        Ticket <span className="font-mono font-bold text-navy">{ticketNo}</span> · PIN{" "}
        <span className="font-mono font-extrabold tracking-[0.2em] text-navy">{pin}</span>
      </span>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-accent-blue hover:bg-sky-tint"
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied ? "Copied" : "Copy"}
      </button>
      <span className="text-xs text-slate-500">Anyone with both can track progress from the login page.</span>
    </div>
  );
}
