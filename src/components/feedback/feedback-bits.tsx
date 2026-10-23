import { Lock, ShieldCheck, Sparkles, ThumbsUp, TriangleAlert, Lightbulb } from "lucide-react";
import { ANONYMOUS_STUDENT, FEEDBACK_MIN_RESPONSES, FEEDBACK_QUESTIONS } from "@/config/feedback";
import type { FeedbackSummary } from "@/lib/ai/feedback";
import type { TeacherSubjectStats } from "@/lib/feedback/types";
import { cn } from "@/lib/utils";

/** "Your feedback is anonymous" style notice (students). */
export function AnonymousNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-start gap-2 rounded-2xl border border-info-fg/25 bg-info-bg p-3 text-sm font-semibold text-info-fg", className)}>
      <ShieldCheck className="mt-0.5 size-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}

/** One 1–5 average as a labelled bar. */
export function ScoreBar({ label, hint, value }: { label: string; hint?: string; value: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-bold text-text" title={hint}>{label}</span>
        <span className="text-sm font-extrabold text-text tabular-nums">{value.toFixed(1)}<span className="font-medium text-text-muted"> / 5</span></span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${label}: ${value.toFixed(1)} out of 5`}>
        <div className="h-full rounded-full bg-primary" style={{ width: `${(value / 5) * 100}%` }} />
      </div>
    </div>
  );
}

function ThemeList({ title, icon: Icon, items, tone }: { title: string; icon: typeof ThumbsUp; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface-2 p-4">
      <p className={cn("eyebrow flex items-center gap-1.5", tone)}>
        <Icon className="size-3.5" /> {title}
      </p>
      <ul className="mt-2 space-y-1.5 text-sm text-text">
        {items.map((s) => (
          <li key={s} className="flex gap-2"><span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-text-muted" />{s}</li>
        ))}
      </ul>
    </div>
  );
}

/** Gemini's themes: strengths, concerns, suggestions. Never quotes anyone. */
export function SummaryPanel({ summary }: { summary: FeedbackSummary | null }) {
  if (!summary) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-4 text-sm text-text-muted">
        The AI summary of the comments isn&apos;t available right now. It is created again the next time this page loads.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="eyebrow flex items-center gap-1.5"><Sparkles className="size-3.5" /> AI summary of themes</p>
      <p className="text-sm leading-relaxed text-text">{summary.overview}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <ThemeList title="Strengths" icon={ThumbsUp} items={summary.strengths} tone="text-success-fg" />
        <ThemeList title="Concerns" icon={TriangleAlert} items={summary.concerns} tone="text-warning-fg" />
        <ThemeList title="Suggestions" icon={Lightbulb} items={summary.suggestions} tone="text-info-fg" />
      </div>
    </div>
  );
}

/** Shown instead of numbers while a teacher/subject has fewer than 5 responses (k-anonymity). */
export function NotEnoughResponses({ count }: { count: number }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-surface-2 p-4 text-sm text-text-muted">
      <Lock className="mt-0.5 size-4 shrink-0" />
      <p>
        Results appear once at least <strong className="text-text">{FEEDBACK_MIN_RESPONSES} students</strong> have responded, so nobody can be identified.
        {count > 0 ? ` ${count} so far.` : " None yet."}
      </p>
    </div>
  );
}

/**
 * One teacher + subject card. `showComments` (HOD / Dean) lists the comments word for word as
 * "Anonymous student"; teachers get averages and the AI themes only.
 */
export function FeedbackStatsCard({ stats, showComments, showTeacher = true }: { stats: TeacherSubjectStats; showComments: boolean; showTeacher?: boolean }) {
  return (
    <section className="animate-slide-up space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">{stats.subject} · {stats.term}</p>
          <h2 className="text-xl font-extrabold text-text">{showTeacher ? stats.teacherName : stats.subject}</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-bold text-text-muted">
            {stats.count} {stats.count === 1 ? "response" : "responses"}
          </span>
          {stats.visible && stats.overall !== null && (
            <span className="rounded-2xl bg-primary px-4 py-2 text-center text-primary-fg">
              <span className="block text-2xl leading-none font-extrabold tabular-nums">{stats.overall.toFixed(1)}</span>
              <span className="text-[10px] font-bold tracking-wider uppercase opacity-80">Overall</span>
            </span>
          )}
        </div>
      </header>

      {!stats.visible || !stats.averages ? (
        <NotEnoughResponses count={stats.count} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEEDBACK_QUESTIONS.map((q) => (
              <ScoreBar key={q.key} label={q.label} hint={q.hint} value={stats.averages![q.key]} />
            ))}
          </div>
          {(stats.summary || stats.count > 0) && <SummaryPanel summary={stats.summary} />}
          {showComments && stats.comments.length > 0 && (
            <div className="space-y-3">
              <p className="eyebrow">Comments · word for word</p>
              <ul className="space-y-2">
                {stats.comments.map((c) => (
                  <li key={c.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-text-muted">{ANONYMOUS_STUDENT}</span>
                      {c.unchecked && (
                        <span className="rounded-full bg-neutral-bg px-2 py-0.5 text-[11px] font-bold text-neutral-fg">Not moderated</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-text">{c.comment}</p>
                    {c.neutral_summary && (
                      <p className="mt-2 flex gap-1.5 text-xs text-text-muted"><Sparkles className="mt-0.5 size-3 shrink-0" /> {c.neutral_summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
