"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, Lock, Send, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { AnonymousNote } from "@/components/feedback/feedback-bits";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CONCERN_ANON_NOTE, CONCERN_CATEGORIES, SAFETY_CONCERN_CATEGORY, type ConcernCategory } from "@/config/feedback";
import { PHOTO_BUCKET } from "@/config/storage";
import { submitConcern } from "@/lib/concerns/actions";
import { compressImage } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

const CATEGORY_HELP: Partial<Record<ConcernCategory, string>> = {
  Discrimination: "Goes straight to the Dean.",
  [SAFETY_CONCERN_CATEGORY]: "Goes to the confidential Safety & Security team (Dean and Anti-Ragging Committee), not the HOD.",
};

interface Teacher {
  id: string;
  name: string;
  subjects: string[];
}

/** "Report a concern about a teacher": anonymous, confidential, never shown to the teacher. */
export function ConcernForm({ userId, teachers }: { userId: string; teachers: Teacher[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [when, setWhen] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [sending, setSending] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticketNo: string; routed: "hod" | "safety"; escalated: boolean } | null>(null);

  const teacher = teachers.find((t) => t.id === teacherId) ?? null;

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
    setWarning(null);
    setError(null);
    if (!teacherId || !subject) return setError("Choose the teacher and the subject.");
    if (!category) return setError("Choose what this is about.");
    if (text.trim().length < 20) return setError("Please describe what happened (at least 20 characters).");
    if (when.trim().length < 2) return setError("Tell us when it happened.");

    setSending(true);
    try {
      let photoPath: string | null = null;
      if (photo) {
        const path = `${userId}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await createClient().storage.from(PHOTO_BUCKET).upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) toast.error("Photo upload failed — sending without the photo.");
        else photoPath = path;
      }
      const res = await submitConcern({ teacherId, subject, category: category as ConcernCategory, text, when, photoPath });
      if (!res.ok) {
        if (res.level === "photo") {
          URL.revokeObjectURL(photo!.previewUrl);
          setPhoto(null);
          setWarning(res.error);
        } else if (res.level) setWarning(res.error);
        else setError(res.error);
        return;
      }
      if ("ticketNo" in res) setDone({ ticketNo: res.ticketNo, routed: res.routed, escalated: res.escalated });
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <div className="animate-slide-up space-y-4 rounded-3xl border border-border bg-surface p-7 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-bg text-success-fg"><CheckCircle2 className="size-7" /></div>
        <h2 className="text-2xl font-extrabold text-text">Your concern was received</h2>
        <p className="eyebrow">Reference number</p>
        <p className="text-4xl font-extrabold tracking-tight text-text">{done.ticketNo}</p>
        <p className="mx-auto max-w-md text-sm text-text-muted">
          {done.routed === "safety"
            ? "This was sent to the confidential Safety & Security team (the Dean and the Anti-Ragging Committee). Only they can see it."
            : done.escalated
              ? "This kind of concern goes straight to the Dean. The teacher will never see it."
              : "The Head of Department will look into it. If it is not acknowledged within 72 hours it goes to the Dean. The teacher will never see it."}{" "}
          Your report is anonymous.
        </p>
        <Button asChild size="lg"><Link href={`/tickets/${done.ticketNo}`}>Follow its progress</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="animate-slide-up space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      <AnonymousNote>{CONCERN_ANON_NOTE} The teacher never sees it or knows it exists. Only the HOD and Dean can read it, and they see &quot;Anonymous student&quot;.</AnonymousNote>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cn-teacher" className="eyebrow">Teacher</Label>
          <SimpleSelect id="cn-teacher" value={teacherId} onChange={(v) => { setTeacherId(v); setSubject(null); }} options={teachers.map((t) => t.id)} placeholder="Choose teacher" disabled={sending} labels={Object.fromEntries(teachers.map((t) => [t.id, t.name]))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cn-subject" className="eyebrow">Subject</Label>
          <SimpleSelect id="cn-subject" value={subject} onChange={setSubject} options={teacher?.subjects ?? []} placeholder={teacher ? "Choose subject" : "Choose a teacher first"} disabled={sending || !teacher} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cn-category" className="eyebrow">What is it about?</Label>
        <SimpleSelect id="cn-category" value={category} onChange={setCategory} options={CONCERN_CATEGORIES} placeholder="Choose a category" disabled={sending} className="sm:w-96" />
        {category && CATEGORY_HELP[category as ConcernCategory] && (
          <p className="flex items-center gap-1.5 text-sm font-semibold text-accent-text"><Lock className="size-3.5" /> {CATEGORY_HELP[category as ConcernCategory]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="cn-text" className="eyebrow">What happened?</Label>
        <Textarea id="cn-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe what happened, in which class, and how it affected you. Facts help the HOD act." className="min-h-40 text-base" maxLength={3000} disabled={sending} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cn-when" className="eyebrow">When?</Label>
        <Input id="cn-when" value={when} onChange={(e) => setWhen(e.target.value)} placeholder="e.g. Last Tuesday during the 10 am class, or: every week since August" className="h-12 text-base" maxLength={200} disabled={sending} />
      </div>

      <div className="space-y-2">
        <p className="eyebrow">Evidence photo (optional)</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        {photo ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={photo.previewUrl} alt="Your evidence" className="max-h-48 rounded-2xl border border-border object-cover" />
            <Button type="button" size="icon-sm" variant="secondary" className="absolute top-2 right-2 rounded-full bg-surface shadow" onClick={() => { URL.revokeObjectURL(photo.previewUrl); setPhoto(null); }} disabled={sending} aria-label="Remove photo">
              <X />
            </Button>
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={sending || compressing} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-2 px-4 py-5 text-sm font-semibold text-text-muted transition-colors hover:border-accent-blue hover:text-accent-text disabled:opacity-60">
            {compressing ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {compressing ? "Preparing photo…" : "Add a document, message screenshot or notice"}
          </button>
        )}
      </div>

      {warning && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {warning}
        </p>
      )}
      {error && <p role="alert" className="text-sm font-semibold text-danger-fg">{error}</p>}

      <Button type="submit" size="lg" disabled={sending || compressing}>
        {sending ? <Loader2 className="animate-spin" /> : <Send />} {sending ? "Checking and sending…" : "Send anonymously"}
      </Button>
    </form>
  );
}
