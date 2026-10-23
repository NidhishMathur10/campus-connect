"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, Loader2, Send, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SimilarQuestion, SimilarResponse } from "@/app/api/ai/similar-questions/route";
import { QA_SUBJECTS } from "@/config/qa";
import { askQuestion } from "@/lib/qa/actions";
import { moderationBlockReason } from "./moderation";
import { SubjectBadge } from "./qa-bits";

const MIN_TITLE_FOR_SEARCH = 12;

export function AskQuestionForm({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  /** True once the student picks a subject themselves — then the AI stops changing it. */
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [aiSubject, setAiSubject] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarQuestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState<"checking" | "posting" | null>(null);
  const lastQuery = useRef("");

  // Debounced "Similar questions already asked" + subject suggestion while typing the title.
  useEffect(() => {
    const text = title.trim();
    if (text.length < MIN_TITLE_FOR_SEARCH || text === lastQuery.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      lastQuery.current = text;
      setSearching(true);
      try {
        const res = await fetch("/api/ai/similar-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: text }),
          signal: controller.signal,
        });
        const data = (await res.json()) as SimilarResponse;
        if (!data.ok) return;
        setSimilar(data.similar);
        if (data.suggested_subject) {
          setAiSubject(data.suggested_subject);
          if (!subjectTouched) setSubject(data.suggested_subject);
        }
      } catch {
        // aborted or offline — the panel just stays as it was
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 900);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title, subjectTouched]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBlocked(null);
    if (title.trim().length < 10) return setError("Make the title a full question (at least 10 characters).");
    if (body.trim().length < 10) return setError("Add a few details (at least 10 characters).");
    if (!subject) return setError("Choose a subject.");

    setPosting("checking");
    try {
      const reason = await moderationBlockReason({ kind: "question", title: title.trim(), text: body.trim() });
      if (reason) return setBlocked(reason);
      setPosting("posting");
      const res = await askQuestion({ title, body, subject: subject as (typeof QA_SUBJECTS)[number] });
      if (!res.ok) {
        if ("blocked" in res) setBlocked(res.error);
        else setError(res.error);
        return;
      }
      toast.success(res.pending_review ? "Posted — a teacher will review it shortly." : "Question posted!");
      router.push(`${basePath}/${res.id}`);
    } finally {
      setPosting(null);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <form onSubmit={submit} className="animate-slide-up space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <div className="space-y-2">
          <Label htmlFor="q-title" className="eyebrow">Your question</Label>
          <Input
            id="q-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. How do I find R_th when there is a dependent source?"
            className="h-12 text-base"
            maxLength={160}
            autoFocus
          />
          <p className="text-xs text-text-muted">Write it as a full question. English or Hindi are both fine.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="q-body" className="eyebrow">Details</Label>
          <Textarea
            id="q-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What have you tried? Where exactly are you stuck?"
            className="min-h-36 text-base"
            maxLength={4000}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="q-subject" className="eyebrow flex items-center gap-1.5">
            Subject {aiSubject && subject === aiSubject && <span className="inline-flex items-center gap-1 normal-case tracking-normal text-accent-violet-text"><Sparkles className="size-3" /> suggested by AI</span>}
          </Label>
          <SimpleSelect
            id="q-subject"
            value={subject}
            onChange={(v) => {
              setSubject(v);
              setSubjectTouched(true);
            }}
            options={QA_SUBJECTS}
            placeholder="Choose subject"
            className="sm:w-72"
          />
        </div>

        {blocked && (
          <div className="flex animate-fade-in items-start gap-3 rounded-2xl border border-danger-fg/30 bg-danger-bg p-4 text-sm text-danger-fg" role="alert">
            <ShieldAlert className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-bold">We couldn&apos;t post this</p>
              <p>{blocked}</p>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-danger-fg">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={!!posting}>
            {posting ? <Loader2 className="animate-spin" /> : <Send />}
            {posting === "checking" ? "Checking…" : posting === "posting" ? "Posting…" : "Post question"}
          </Button>
          <p className="text-xs text-text-muted">Posted under your name. Classmates see your name; teachers also see your roll number.</p>
        </div>
      </form>

      <aside className="h-fit animate-slide-up space-y-3 rounded-3xl border border-border bg-surface-accent p-5 [animation-delay:80ms]">
        <p className="eyebrow flex items-center gap-1.5">
          {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Similar questions already asked
        </p>
        {similar === null ? (
          <p className="text-sm text-text-muted">Start typing your question — we&apos;ll check if someone already asked it.</p>
        ) : similar.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-text-muted">
            <CheckCircle2 className="size-4 text-success-fg" /> Nothing similar yet — go ahead and ask!
          </p>
        ) : (
          <ul className="space-y-2">
            {similar.map((s) => (
              <li key={s.id}>
                <Link
                  href={`${basePath}/${s.id}`}
                  target="_blank"
                  className="group block space-y-1.5 rounded-2xl border border-surface bg-surface p-3 transition-colors hover:border-accent-blue"
                >
                  <span className="flex items-start justify-between gap-2 text-sm font-bold text-text group-hover:text-accent-text">
                    {s.title}
                    <ArrowUpRight className="size-4 shrink-0" />
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <SubjectBadge subject={s.subject} />
                    {s.status === "answered" && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-fg">
                        <CheckCircle2 className="size-3" /> Answered
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
