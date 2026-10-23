"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, ImagePlus, Loader2, Lock, Send, ShieldAlert, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import type { SimilarQuestion, SimilarResponse } from "@/app/api/ai/similar-questions/route";
import { SimpleSelect } from "@/components/common/simple-select";
import { SubjectBadge } from "@/components/qa/qa-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PHOTO_BUCKET } from "@/config/storage";
import { DOUBT_SUBJECTS } from "@/config/subjects";
import { askDoubt } from "@/lib/doubts/actions";
import { compressImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

const MIN_TITLE_FOR_SEARCH = 12;

/**
 * "Ask my teacher": pick a subject (the mapped teachers appear), write the doubt, optionally add a photo.
 * While typing, answered questions from the public board are suggested, so a quick look might save the wait.
 */
export function AskTeacherForm({
  userId,
  teachersBySubject,
  initialSubject,
}: {
  userId: string;
  teachersBySubject: Record<string, string[]>;
  initialSubject: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState<string | null>(initialSubject && DOUBT_SUBJECTS.includes(initialSubject as never) ? initialSubject : null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [similar, setSimilar] = useState<SimilarQuestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const lastQuery = useRef("");

  const teachers = subject ? (teachersBySubject[subject] ?? []) : [];

  // Debounced "Similar questions already answered" while typing the title.
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
          body: JSON.stringify({ title: text, body: body.slice(0, 600) || undefined }),
          signal: controller.signal,
        });
        const data = (await res.json()) as SimilarResponse;
        if (data.ok) setSimilar(data.similar.filter((s) => s.status === "answered"));
      } catch {
        // aborted or offline: the panel just stays as it was
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 900);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title, body]);

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setCompressing(true);
    try {
      const blob = await compressImage(file);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      setPhoto({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use this photo.");
    } finally {
      setCompressing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBlocked(null);
    if (!subject) return setError("Choose a subject.");
    if (teachers.length === 0) return setError("No teacher is assigned to this subject yet. Please ask on the open Q&A board.");
    if (title.trim().length < 10) return setError("Make the title a full question (at least 10 characters).");
    if (body.trim().length < 10) return setError("Add a few details (at least 10 characters).");

    setSending(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await createClient().storage.from(PHOTO_BUCKET).upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) toast.error("Photo upload failed — sending without the photo.");
        else photoPath = path;
      }
      const res = await askDoubt({ subject, title, body, photoPath });
      if (!res.ok) {
        if ("blocked" in res) setBlocked(res.error);
        else setError(res.error);
        return;
      }
      toast.success("Sent! Your teacher will reply here.");
      router.push(`/education/doubts/${res.id}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <form onSubmit={submit} className="animate-slide-up space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
        <div className="space-y-2">
          <Label htmlFor="d-subject" className="eyebrow">Subject</Label>
          <SimpleSelect id="d-subject" value={subject} onChange={setSubject} options={DOUBT_SUBJECTS} placeholder="Choose subject" className="sm:w-72" disabled={sending} />
          {subject && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
              <UserRound className="size-4" />
              {teachers.length > 0 ? (
                <>
                  Goes privately to{" "}
                  {teachers.map((t) => (
                    <span key={t} className="rounded-full bg-surface-accent px-2.5 py-0.5 font-bold text-text">{t}</span>
                  ))}
                </>
              ) : (
                <span className="font-semibold text-warning-fg">No teacher is assigned to this subject yet. Try the open Q&amp;A board.</span>
              )}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="d-title" className="eyebrow">Your doubt</Label>
          <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Why does the Thevenin resistance change with a dependent source?" className="h-12 text-base" maxLength={160} disabled={sending} />
          <p className="text-xs text-text-muted">Write it as a full question. English or Hindi are both fine.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="d-body" className="eyebrow">Details</Label>
          <Textarea id="d-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What have you tried? Where exactly are you stuck?" className="min-h-36 text-base" maxLength={4000} disabled={sending} />
        </div>

        <div className="space-y-2">
          <p className="eyebrow">Photo (optional)</p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
          {photo ? (
            <div className="relative w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={photo.previewUrl} alt="Your photo" className="max-h-48 rounded-2xl border border-border object-cover" />
              <Button type="button" size="icon-sm" variant="secondary" className="absolute top-2 right-2 rounded-full bg-surface shadow" onClick={() => { URL.revokeObjectURL(photo.previewUrl); setPhoto(null); }} disabled={sending} aria-label="Remove photo">
                <X />
              </Button>
            </div>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={sending || compressing} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-2 px-4 py-5 text-sm font-semibold text-text-muted transition-colors hover:border-accent-blue hover:text-accent-text disabled:opacity-60">
              {compressing ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
              {compressing ? "Preparing photo…" : "Add a photo of your working or the question"}
            </button>
          )}
        </div>

        {blocked && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {blocked}
          </p>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-danger-fg">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={sending || compressing}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />} {sending ? "Sending…" : "Send to my teacher"}
          </Button>
          <p className="flex items-center gap-1.5 text-xs text-text-muted"><Lock className="size-3.5" /> Only you, your subject teacher and the HOD can see this.</p>
        </div>
      </form>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-3xl border border-border bg-surface p-5">
          <p className="eyebrow flex items-center gap-1.5">
            {searching ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />} Similar questions already answered
          </p>
          {similar === null ? (
            <p className="mt-2 text-sm text-text-muted">Start typing your doubt. If the public board already has an answer, it shows up here.</p>
          ) : similar.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">Nothing similar has been answered yet, so your question is new.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {similar.map((s) => (
                <li key={s.id}>
                  <Link href={`/education/qa/${s.id}`} target="_blank" className="group block rounded-2xl border border-border bg-surface-2 p-3 transition-colors hover:border-accent-blue">
                    <SubjectBadge subject={s.subject} />
                    <span className="mt-1.5 flex items-start justify-between gap-2 text-sm font-semibold text-text">
                      {s.title}
                      <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-text-muted group-hover:text-accent-text" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
