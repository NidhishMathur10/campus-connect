import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Clock, ExternalLink, Gavel, Lightbulb, MapPin, Sparkles, Users, Zap } from "lucide-react";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { EscalationStatusBadge, ReasonBadge } from "@/components/escalations/escalation-bits";
import { BriefAutogen, EscalationActions, RegenerateBriefButton } from "@/components/escalations/escalation-client";
import { LiveRefresh } from "@/components/tickets/live-refresh";
import { TicketTimeline } from "@/components/tickets/ticket-timeline";
import { requireProfile } from "@/lib/auth";
import { briefMissing, canActOnEscalation, getEscalationDetail } from "@/lib/escalation-queries";
import { TARGET_LABELS } from "@/lib/escalations";
import { formatDateTime, formatLocation, timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Escalation" };

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6 ${className}`}>{children}</section>;
}

export default async function EscalationPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["warden", "dean", "hod"]);
  const { id } = await params;
  const viewer = { id: profile.id, role: profile.role, department: profile.department };
  const detail = await getEscalationDetail(id, viewer);
  if (!detail) notFound();
  const { escalation: e, tickets, where, allClosed } = detail;
  const canAct = canActOnEscalation(viewer, e);
  const targetLabel = TARGET_LABELS[e.target_role];
  const stale = e.brief_model && e.brief_count !== e.affected_count;
  const missing = briefMissing(e);

  return (
    <>
      <Link href="/escalations" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> All escalations
      </Link>

      <div className="mb-6 animate-slide-up space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ReasonBadge reason={e.reason} />
          <EscalationStatusBadge status={e.status} />
          <span className="eyebrow">To the {targetLabel}</span>
          <LiveRefresh />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-4xl">{e.headline ?? where}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-text-muted">
          <span className="flex items-center gap-1.5"><MapPin className="size-4 text-text-muted" /> {where}</span>
          <span className="flex items-center gap-1.5"><Users className="size-4 text-text-muted" /> {e.affected_count} student{e.affected_count === 1 ? "" : "s"} affected</span>
          <span className="flex items-center gap-1.5"><Clock className="size-4 text-text-muted" /> Escalated {timeAgo(e.created_at)}</span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card className="space-y-4 border-border bg-gradient-to-br from-surface to-surface-accent">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="eyebrow flex items-center gap-1.5 text-accent-text"><Sparkles className="size-3.5" /> AI brief</p>
              {canAct || profile.role === "warden" ? <RegenerateBriefButton escalationId={e.id} /> : null}
            </div>
            {e.brief_model ? (
              <>
                <p className="whitespace-pre-line text-text">{e.brief}</p>
                {e.urgency_reason && (
                  <p className="flex items-start gap-2 text-sm text-danger-fg"><Zap className="mt-0.5 size-4 shrink-0" /> {e.urgency_reason}</p>
                )}
                <div className="rounded-2xl bg-surface-inverse p-4 text-text-inverse">
                  <p className="eyebrow flex items-center gap-1.5 text-info-on-inverse"><Lightbulb className="size-3.5" /> Recommended action</p>
                  <p className="mt-1 font-semibold">{e.recommended_action}</p>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-text-muted">
                  <Bot className="size-3.5" />
                  {e.brief_model === "template" ? "Basic summary (Gemini was unavailable)" : `Written by ${e.brief_model}`}
                  {stale && " · more students affected since — refreshing"}
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-text-muted"><Sparkles className="size-4 animate-pulse" /> Gemini is writing the brief…</p>
            )}
          </Card>

          {e.directive && (
            <Card className="border-violet-fg/30 bg-violet-bg">
              <p className="eyebrow flex items-center gap-1.5 text-violet-fg"><Gavel className="size-3.5" /> Directive from the {targetLabel}</p>
              <p className="mt-1 font-semibold text-text">{e.directive}</p>
              {e.acknowledged_at && <p className="mt-1 text-xs text-text-muted">Acknowledged {formatDateTime(e.acknowledged_at)}</p>}
            </Card>
          )}

          <div className="space-y-4">
            <p className="eyebrow">Linked tickets ({tickets.length})</p>
            {tickets.map((t) => (
              <Card key={t.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Link
                      href={`/staff/history?t=${t.ticket_no}`}
                      className="inline-flex items-center gap-1 font-mono text-xs font-bold text-accent-text hover:underline"
                    >
                      {t.ticket_no} <ExternalLink className="size-3" />
                    </Link>
                    <p className="font-bold text-text">{t.title}</p>
                    <p className="text-xs text-text-muted">{formatLocation(t)} · reported {formatDateTime(t.created_at)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusBadge status={t.status} />
                    <CategoryBadge category={t.category} />
                    <PriorityBadge priority={t.priority} />
                  </div>
                </div>
                {t.summary && <p className="text-sm text-text">{t.summary}</p>}
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-text-muted">
                  <span>{1 + t.follower_count} student{t.follower_count ? "s" : ""}</span>
                  {t.reopen_count > 0 && <span className="text-danger-fg">Reopened {t.reopen_count}×</span>}
                </div>
                {t.photo_url && (
                  <a href={t.photo_url} target="_blank" rel="noreferrer" className="block w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL */}
                    <img src={t.photo_url} alt={`Photo for ${t.ticket_no}`} className="h-40 rounded-2xl border border-border object-cover" />
                  </a>
                )}
                <details className="rounded-2xl bg-surface-2 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-text">Timeline ({t.events.length} updates)</summary>
                  <div className="mt-4"><TicketTimeline events={t.events} /></div>
                </details>
              </Card>
            ))}
          </div>
        </div>

        <Card className="h-fit space-y-4 lg:sticky lg:top-24">
          <p className="eyebrow">{canAct ? "Your decision" : "Status"}</p>
          {canAct ? (
            <EscalationActions
              escalationId={e.id}
              status={e.status}
              directive={e.directive}
              allClosed={allClosed}
              targetLabel={e.target_role === "dean" ? "Dean" : "HOD"}
            />
          ) : (
            <p className="text-sm text-text-muted">
              Only the {targetLabel} can acknowledge this or add a directive. You&apos;ll see their directive here and on each ticket.
            </p>
          )}
        </Card>
      </div>
      {missing && <BriefAutogen ids={[e.id]} />}
    </>
  );
}
