"use client";

import { useState } from "react";
import { Building2, CalendarDays, Loader2, Search, SearchX } from "lucide-react";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MODULE_LABELS } from "@/config/routing";
import { STATUS_STYLES } from "@/config/styles";
import { formatDateTime } from "@/lib/format";
import type { PublicTrackResponse } from "@/lib/tickets/public-track";
import { cn } from "@/lib/utils";

/** Track a ticket by its number, no login (login page card and the public /track page). */
export function PublicTrackCard({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [ticketNo, setTicketNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublicTrackResponse | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketNo }),
      });
      setResult((await res.json()) as PublicTrackResponse);
    } catch {
      setResult({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn("space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6", className)}>
      <div>
        <p className="eyebrow flex items-center gap-1.5"><Search className="size-3.5" /> Track a ticket</p>
        {!compact && <h2 className="mt-1 text-xl font-extrabold text-foreground">No login needed</h2>}
        <p className="text-sm text-slate-500">Enter the ticket number from the confirmation screen, e.g. CC-1043.</p>
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="track-no">Ticket number</Label>
          <Input id="track-no" value={ticketNo} onChange={(e) => setTicketNo(e.target.value)} placeholder="CC-1043" autoComplete="off" required />
        </div>
        <Button type="submit" disabled={busy} className="sm:mb-0">
          {busy ? <Loader2 className="animate-spin" /> : <Search />} Track
        </Button>
      </form>

      {result && !result.ok && (
        <p role="alert" className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
          <SearchX className="size-4 shrink-0 text-slate-500" /> {result.error}
        </p>
      )}

      {result?.ok && (
        <div className="animate-fade-in space-y-4 rounded-2xl border border-border bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary px-3 py-1 font-mono text-sm font-bold text-primary-foreground">{result.ticket.ticket_no}</span>
            <span className="eyebrow">{MODULE_LABELS[result.ticket.module]}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={result.ticket.status} />
            <CategoryBadge category={result.ticket.category} />
            <PriorityBadge priority={result.ticket.priority} />
          </div>
          <div className="grid gap-1 text-sm font-semibold text-slate-700 sm:grid-cols-2">
            <p className="flex items-center gap-2"><Building2 className="size-4 text-slate-500" /> {result.ticket.building ?? "Location not given"}</p>
            <p className="flex items-center gap-2"><CalendarDays className="size-4 text-slate-500" /> Reported {formatDateTime(result.ticket.created_at)}</p>
          </div>
          <div>
            <p className="eyebrow mb-2">Progress</p>
            <ol className="space-y-2.5 border-l-2 border-border pl-4">
              {result.events.map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-card", STATUS_STYLES[e.status]?.dot ?? "bg-slate-400")} />
                  <span className="font-bold text-foreground">{e.status}</span>
                  <span className="text-slate-500"> · {e.actor} · {formatDateTime(e.at)}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}
