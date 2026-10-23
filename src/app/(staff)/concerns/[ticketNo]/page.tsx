import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, Siren, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/common/badges";
import { ConcernActions, ConcernTimeline } from "@/components/feedback/concern-detail";
import { ANONYMOUS_STUDENT } from "@/config/feedback";
import { requireProfile } from "@/lib/auth";
import { getConcern } from "@/lib/concerns/queries";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Teacher concern" };

export default async function ConcernDetailPage({ params }: { params: Promise<{ ticketNo: string }> }) {
  const profile = await requireProfile(["hod", "dean"]);
  const { ticketNo } = await params;
  const concern = await getConcern(decodeURIComponent(ticketNo).toUpperCase());
  if (!concern) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/concerns" className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Teacher concerns
      </Link>

      <section className="animate-slide-up space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-extrabold text-text">{concern.ticket_no}</span>
          <StatusBadge status={concern.status} />
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-bold text-neutral-fg"><Lock className="size-3" /> Confidential</span>
          {concern.escalated_at && (
            <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-bold text-danger-fg"><Siren className="size-3" /> Escalated to Dean</span>
          )}
          {concern.unchecked && <span className="rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-bold text-neutral-fg">Not moderated</span>}
        </div>
        <h1 className="text-2xl font-extrabold text-text sm:text-3xl">{concern.concern_category}</h1>
        <dl className="grid gap-4 sm:grid-cols-4">
          {[
            ["Teacher", concern.teacher_name],
            ["Subject", concern.subject],
            ["Reported by", ANONYMOUS_STUDENT],
            ["When", concern.happened_when ?? "Not given"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="eyebrow">{k}</dt>
              <dd className="mt-1 text-sm font-bold text-text">{v}</dd>
            </div>
          ))}
        </dl>
        {concern.neutral_summary && (
          <div className="rounded-2xl bg-surface-accent p-4">
            <p className="eyebrow flex items-center gap-1.5"><Sparkles className="size-3.5" /> AI summary (neutral)</p>
            <p className="mt-1.5 text-sm text-text">{concern.neutral_summary}</p>
          </div>
        )}
        <div>
          <p className="eyebrow">What the student wrote</p>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-text">{concern.original_text}</p>
        </div>
        {concern.photo_url && (
          <div>
            <p className="eyebrow">Evidence</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
            <img src={concern.photo_url} alt="Evidence photo" className="mt-1.5 max-h-72 rounded-2xl border border-border object-cover" />
          </div>
        )}
        <p className="text-xs text-text-muted">Filed {formatDateTime(concern.created_at)} · term {concern.term}. The teacher cannot see this concern or know that it exists.</p>
      </section>

      <ConcernActions concern={concern} role={profile.role} />

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold text-text">History</h2>
        <ConcernTimeline events={concern.events} />
      </section>
    </div>
  );
}
