"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Loader2, Send, ShieldAlert, Star } from "lucide-react";
import { toast } from "sonner";
import { AnonymousNote } from "@/components/feedback/feedback-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FEEDBACK_ANON_NOTE, FEEDBACK_QUESTIONS, type FeedbackKey } from "@/config/feedback";
import { submitFeedback } from "@/lib/feedback/actions";
import type { RateableTeacher } from "@/lib/feedback/types";
import { cn } from "@/lib/utils";

function StarInput({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <p className="text-sm font-bold text-text">{label}</p>
        <p className="text-xs text-text-muted">{hint}</p>
      </div>
      <div role="radiogroup" aria-label={label} className="flex shrink-0 gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 5`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="rounded-lg p-1 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
          >
            <Star className={cn("size-7", n <= value ? "fill-star text-star" : "text-text-muted/40")} />
          </button>
        ))}
      </div>
    </div>
  );
}

function RateForm({ item, onDone }: { item: RateableTeacher; onDone: () => void }) {
  const [scores, setScores] = useState<Partial<Record<FeedbackKey, number>>>({});
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setWarning(null);
    setError(null);
    if (FEEDBACK_QUESTIONS.some((q) => !scores[q.key])) return setError("Rate every question from 1 to 5.");
    setSending(true);
    try {
      const res = await submitFeedback({
        teacherId: item.teacherId,
        subject: item.subject,
        clarity: scores.clarity!,
        doubt_solving: scores.doubt_solving!,
        punctuality: scores.punctuality!,
        fairness: scores.fairness!,
        respect: scores.respect!,
        comment: comment.trim() || undefined,
      });
      if (!res.ok) {
        // Ratings and comment stay as they are, so the student only edits the wording.
        if (res.level === "rephrase" || res.level === "block") setWarning(res.error);
        else setError(res.error);
        return;
      }
      toast.success("Thank you! Your anonymous feedback was submitted.");
      onDone();
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 border-t border-border p-5">
      <div className="space-y-4">
        {FEEDBACK_QUESTIONS.map((q) => (
          <StarInput key={q.key} label={q.label} hint={q.hint} value={scores[q.key] ?? 0} onChange={(n) => setScores((s) => ({ ...s, [q.key]: n }))} disabled={sending} />
        ))}
      </div>
      <div className="space-y-2">
        <label htmlFor={`c-${item.teacherId}-${item.subject}`} className="eyebrow">Comment (optional)</label>
        <Textarea
          id={`c-${item.teacherId}-${item.subject}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="What works well? What could be better? Honest, specific feedback helps most."
          className="min-h-28 text-base"
          maxLength={1000}
          disabled={sending}
        />
        <p className="text-xs text-text-muted">Honest criticism is welcome. Insults and abusive language are not. Comments are only ever shown to the HOD and Dean, never with your name.</p>
      </div>
      {warning && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {warning}
        </p>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-danger-fg">{error}</p>}
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? <Loader2 className="animate-spin" /> : <Send />} {sending ? "Checking and sending…" : "Submit anonymously"}
      </Button>
    </form>
  );
}

/** "Rate my teachers": one collapsible card per teacher and subject, once per term. */
export function RateTeachers({ items, term }: { items: RateableTeacher[]; term: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const keyOf = (i: RateableTeacher) => `${i.teacherId}|${i.subject}`;

  return (
    <div className="space-y-4">
      <AnonymousNote>{FEEDBACK_ANON_NOTE}</AnonymousNote>
      <p className="text-sm text-text-muted">Term <strong className="text-text">{term}</strong>. You can rate each teacher once per subject this term. Results are shown to teachers only after 5 students have responded.</p>
      <ul className="space-y-3">
        {items.map((item) => {
          const key = keyOf(item);
          const rated = item.rated || doneKeys.has(key);
          const isOpen = open === key && !rated;
          return (
            <li key={key} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
              <button
                type="button"
                onClick={() => !rated && setOpen(isOpen ? null : key)}
                disabled={rated}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span>
                  <span className="block text-base font-extrabold text-text">{item.teacherName}</span>
                  <span className="block text-sm text-text-muted">{item.subject}</span>
                </span>
                {rated ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-xs font-bold text-success-fg">
                    <CheckCircle2 className="size-3.5" /> Rated this term
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-accent-text">
                    Rate <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
                  </span>
                )}
              </button>
              {isOpen && (
                <RateForm
                  item={item}
                  onDone={() => {
                    setDoneKeys((s) => new Set(s).add(key));
                    setOpen(null);
                    router.refresh();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
