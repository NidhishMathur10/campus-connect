import Link from "next/link";
import { AlertCircle, Building2, Clock, Copy, GitMerge, Languages, Lock, MapPin, Sparkles, Star, Timer, Users } from "lucide-react";
import { CategoryBadge, ConfidentialBadge, EscalatedBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { MODULE_LABELS } from "@/config/routing";
import { OPEN_STATUSES } from "@/config/statuses";
import { formatDateTime, formatLocation, languageName, timeAgo } from "@/lib/format";
import type { TrackedTicket } from "@/lib/tickets/queries";
import type { Ticket, TicketEvent } from "@/lib/types";
import { Confidence, PhotoAnalysisBox, SafetyBadge } from "./ai-bits";
import { LiveRefresh } from "./live-refresh";
import { PinChip } from "./pin-chip";
import { ResolutionPanel } from "./resolution-panel";
import { TicketTimeline } from "./ticket-timeline";

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}

function Header({
  ticket,
  extra,
  live,
}: {
  ticket: Pick<Ticket, "ticket_no" | "title" | "status" | "category" | "priority" | "escalated" | "module" | "created_at">;
  extra?: React.ReactNode;
  live?: React.ReactNode;
}) {
  return (
    <div className="mb-6 animate-slide-up space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-navy px-3 py-1 font-mono text-sm font-bold text-white">{ticket.ticket_no}</span>
        <span className="eyebrow">{MODULE_LABELS[ticket.module]}</span>
        {live}
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-4xl">{ticket.title}</h1>
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge status={ticket.status} />
        <CategoryBadge category={ticket.category} />
        <PriorityBadge priority={ticket.priority} />
        {ticket.escalated && <EscalatedBadge />}
        {extra}
      </div>
      <p className="text-xs text-slate-500">Reported {formatDateTime(ticket.created_at)} ({timeAgo(ticket.created_at)})</p>
    </div>
  );
}

function isOverdue(dueAt: string): boolean {
  return new Date(dueAt).getTime() < Date.now();
}

function SlaLine({ ticket }: { ticket: Ticket }) {
  if (!ticket.sla_due_at || !OPEN_STATUSES.includes(ticket.status)) return null;
  const overdue = isOverdue(ticket.sla_due_at);
  return (
    <p className={`flex items-center gap-2 text-sm font-semibold ${overdue ? "text-red-600" : "text-slate-700"}`}>
      <Timer className="size-4 text-slate-400" />
      {overdue ? "Overdue — target was " : "Target fix by "}
      {formatDateTime(ticket.sla_due_at)}
    </p>
  );
}

/** Full ticket view for the reporter / followers (and later staff). */
export function TicketDetail({
  ticket,
  events,
  viewerId,
  mergedInto,
}: {
  ticket: Ticket;
  events: TicketEvent[];
  viewerId: string;
  mergedInto: string | null;
}) {
  const isReporter = ticket.reporter_id === viewerId;
  const ai = ticket.ai_meta;
  const translated = ticket.language !== "en" && ticket.english_text && ticket.english_text !== ticket.original_text;

  return (
    <>
      <Header
        ticket={ticket}
        live={<LiveRefresh ticketId={ticket.id} />}
        extra={
          <>
            {ai?.is_safety_hazard && <SafetyBadge />}
            {ticket.is_confidential && <ConfidentialBadge />}
            {ticket.duplicate_status === "flagged" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                <Copy className="size-3" /> Possible duplicate — staff reviewing
              </span>
            )}
            {!isReporter && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-tint px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                <Users className="size-3" /> You&apos;re following (Me too)
              </span>
            )}
          </>
        }
      />

      {isReporter &&
        (ticket.module === "security" ? (
          <p className="-mt-3 mb-6 flex items-center gap-1.5 text-sm font-semibold text-slate-500">
            <Lock className="size-4" /> Safety reports can&apos;t be tracked publicly — only here, while logged in.
          </p>
        ) : (
          <PinChip ticketNo={ticket.ticket_no} pin={ticket.tracking_pin} className="-mt-3 mb-6" />
        ))}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          {mergedInto && (
            <Link
              href={`/tickets/${mergedInto}`}
              className="flex items-center gap-3 rounded-3xl border border-zinc-200 bg-zinc-50 p-4 text-sm font-semibold text-zinc-700 hover:border-accent-blue"
            >
              <GitMerge className="size-5" /> Merged into {mergedInto} — the same problem was already reported. Follow progress there →
            </Link>
          )}

          {ticket.status === "Resolved" &&
            (isReporter ? (
              <ResolutionPanel ticketId={ticket.id} />
            ) : (
              <Card className="border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-800">
                Staff marked this resolved. Waiting for the student who reported it to confirm.
              </Card>
            ))}

          {ticket.status === "Closed" && ticket.rating && (
            <Card className="flex flex-wrap items-center gap-3">
              <span className="eyebrow">{isReporter ? "Your rating" : "Student rating"}</span>
              <span className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`size-5 ${n <= ticket.rating! ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                ))}
              </span>
              {ticket.feedback && <span className="text-sm text-slate-600">“{ticket.feedback}”</span>}
            </Card>
          )}

          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="eyebrow flex items-center gap-1.5"><Sparkles className="size-3.5" /> AI summary</p>
              <p className="whitespace-pre-wrap text-slate-800">{ticket.summary ?? ticket.english_text ?? ticket.original_text}</p>
              {ai?.extracted_issue && (
                <p className="text-sm text-slate-500"><span className="font-semibold text-slate-700">Issue:</span> {ai.extracted_issue}</p>
              )}
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <p className="flex items-center gap-2 font-semibold text-slate-700"><MapPin className="size-4 text-slate-400" /> {formatLocation(ticket)}</p>
              <p className="flex items-center gap-2 font-semibold text-slate-700"><Building2 className="size-4 text-slate-400" /> {ticket.department}</p>
              <SlaLine ticket={ticket} />
              {ticket.resolved_at && (
                <p className="flex items-center gap-2 font-semibold text-emerald-700"><Clock className="size-4" /> Resolved {formatDateTime(ticket.resolved_at)}</p>
              )}
            </div>
            {ticket.details_incomplete && (
              <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 size-4 shrink-0" /> Some details were missing when this was reported — staff may contact you.
              </p>
            )}
          </Card>

          {(ticket.photo_url || ticket.photo_analysis) && (
            <Card className="grid gap-4 sm:grid-cols-[220px_1fr]">
              {ticket.photo_url && (
                <a href={ticket.photo_url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL */}
                  <img src={ticket.photo_url} alt="Complaint photo" className="h-52 w-full rounded-2xl border border-slate-200 object-cover" />
                </a>
              )}
              {ticket.photo_analysis && <PhotoAnalysisBox analysis={ticket.photo_analysis} />}
            </Card>
          )}

          <Card className="space-y-3">
            <p className="eyebrow">Original complaint{translated ? ` (${languageName(ticket.language)})` : ""}</p>
            <p className="text-sm whitespace-pre-wrap text-slate-700">{ticket.original_text}</p>
            {translated && (
              <>
                <p className="eyebrow flex items-center gap-1.5 pt-1"><Languages className="size-3.5" /> English translation</p>
                <p className="text-sm text-slate-700">{ticket.english_text}</p>
              </>
            )}
          </Card>

          {ai && ai.model !== "manual" && (ai.category || ai.priority) && (
            <Card className="space-y-3">
              <p className="eyebrow flex items-center gap-1.5"><Sparkles className="size-3.5" /> How the AI routed this</p>
              {(["category", "department", "priority"] as const).map((field) => {
                const meta = ai[field];
                if (!meta) return null;
                return (
                  <div key={field} className="space-y-0.5 text-sm">
                    <p className="flex items-center gap-2 font-semibold text-navy capitalize">
                      {field}: <span className="font-bold">{field === "category" ? ticket.category : field === "department" ? ticket.department : ticket.priority}</span>
                      <Confidence value={meta.confidence} />
                    </p>
                    <p className="text-slate-500">{meta.reason}</p>
                  </div>
                );
              })}
            </Card>
          )}
        </div>

        <Card className="h-fit lg:sticky lg:top-24">
          <p className="eyebrow mb-4">Progress history</p>
          <TicketTimeline events={events} />
        </Card>
      </div>
    </>
  );
}

/** Basic status + timeline for anyone tracking a ticket by number. */
export function TrackedTicketView({ ticket, events }: { ticket: TrackedTicket; events: TicketEvent[] }) {
  return (
    <>
      <Header ticket={ticket} />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <Card className="h-fit space-y-3 text-sm">
          <p className="eyebrow">Ticket status</p>
          <p className="flex items-center gap-2 font-semibold text-slate-700">
            <MapPin className="size-4 text-slate-400" /> {formatLocation({ building: ticket.building, floor: ticket.floor })}
          </p>
          <p className="flex items-center gap-2 font-semibold text-slate-700">
            <Building2 className="size-4 text-slate-400" /> {ticket.department}
          </p>
          <p className="flex items-center gap-2 text-slate-500">
            <Clock className="size-4 text-slate-400" /> Last update {timeAgo(ticket.updated_at)}
          </p>
          <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">
            This is the public tracking view. Only the student who reported it (and students who joined with
            “Me too”) can see the full details and photo.
          </p>
        </Card>
        <Card>
          <p className="eyebrow mb-4">Progress history</p>
          <TicketTimeline events={events} />
        </Card>
      </div>
    </>
  );
}
