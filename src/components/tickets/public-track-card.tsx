"use client";

import { useState } from "react";
import { Building2, CalendarDays, KeyRound, Loader2, Search, SearchX } from "lucide-react";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MODULE_LABELS } from "@/config/routing";
import { STATUS_STYLES } from "@/config/styles";
import { formatDateTime } from "@/lib/format";
import type { PublicTrackResponse } from "@/lib/tickets/public-track";
import { cn } from "@/lib/utils";

/** Track a ticket with its number + PIN, no login (login page card and the public /track page). */
export function PublicTrackCard({ className, compact = false }: { className?: string; compact?: boolean }) {
  const [ticketNo, setTicketNo] = useState("");
  const [pin, setPin] = useState("");
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
        body: JSON.stringify({ ticketNo, pin }),
      });
      setResult((await res.json()) as PublicTrackResponse);
    } catch {
      setResult({ ok: false, error: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn("space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6", className)}>
      <div>
        <p className="eyebrow flex items-center gap-1.5"><Search className="size-3.5" /> Track a ticket</p>
        {!compact && <h2 className="mt-1 text-xl font-extrabold text-navy">No login needed</h2>}
        <p className="text-sm text-slate-500">Enter the ticket number and the 4-character PIN from the confirmation screen.</p>
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="track-no">Ticket number</Label>
          <Input id="track-no" value={ticketNo} onChange={(e) => setTicketNo(e.target.value)} placeholder="CC-1043" autoComplete="off" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="track-pin">PIN</Label>
          <Input
            id="track-pin"
            value={pin}
            onChange={(e) => setPin(e.target.value.toUpperCase())}
            placeholder="K7Q2"
            maxLength={4}
            autoComplete="off"
            className="font-mono tracking-[0.3em] uppercase"
            required
          />
        </div>
        <Button type="submit" disabled={busy} className="sm:mb-0">
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Track
        </Button>
      </form>

      {result && !result.ok && (
        <p role="alert" className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">
          <SearchX className="size-4 shrink-0 text-slate-400" /> {result.error}
        </p>
      )}

      {result?.ok && (
        <div className="animate-fade-in space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-navy px-3 py-1 font-mono text-sm font-bold text-white">{result.ticket.ticket_no}</span>
            <span className="eyebrow">{MODULE_LABELS[result.ticket.module]}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={result.ticket.status} />
            <CategoryBadge category={result.ticket.category} />
            <PriorityBadge priority={result.ticket.priority} />
          </div>
          <div className="grid gap-1 text-sm font-semibold text-slate-700 sm:grid-cols-2">
            <p className="flex items-center gap-2"><Building2 className="size-4 text-slate-400" /> {result.ticket.building ?? "Location not given"}</p>
            <p className="flex items-center gap-2"><CalendarDays className="size-4 text-slate-400" /> Reported {formatDateTime(result.ticket.created_at)}</p>
          </div>
          <div>
            <p className="eyebrow mb-2">Progress</p>
            <ol className="space-y-2.5 border-l-2 border-slate-200 pl-4">
              {result.events.map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-white", STATUS_STYLES[e.status]?.dot ?? "bg-slate-400")} />
                  <span className="font-bold text-navy">{e.status}</span>
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
