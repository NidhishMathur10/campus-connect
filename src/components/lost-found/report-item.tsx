"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  EyeOff,
  Handshake,
  ImagePlus,
  Loader2,
  MapPin,
  PackageCheck,
  PackageSearch,
  Pencil,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AnimatedCheck } from "@/components/common/celebrate";
import { SimpleSelect } from "@/components/common/simple-select";
import { PhotoAnalysisBox } from "@/components/tickets/ai-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  isLfCategory,
  LF_CATEGORIES,
  LF_PLACES,
  LF_SENSITIVE_CATEGORIES,
  type LfCategory,
  type LfHeldAt,
  type LfType,
} from "@/config/lost-found";
import { MODERATION_MESSAGES } from "@/config/moderation";
import { PHOTO_BUCKET } from "@/config/storage";
import { compressImage } from "@/lib/image";
import type { LfAnalysis, LfAnalyzeResponse } from "@/lib/lost-found/analysis";
import { createLostFoundItem } from "@/lib/lost-found/actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { LfCategoryBadge, LfTypeBadge } from "./item-bits";

export interface ReportPrefill {
  type?: LfType;
  text?: string;
  building?: string | null;
  spot?: string;
}

/** `datetime-local` value for "now" in the browser's timezone. */
function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

async function postAnalyze(body: unknown): Promise<LfAnalyzeResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("/api/lost-found/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return (await res.json()) as LfAnalyzeResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type Phase = "form" | "analyzing" | "preview" | "saving" | "done";

interface Edit {
  title: string;
  publicDescription: string;
  category: LfCategory;
  color: string;
  brand: string;
  marks: string;
  sensitive: boolean;
  verificationQuestion: string;
  verificationAnswer: string;
}

/**
 * Report a lost or found item: form -> one Gemini call (details + moderation) -> editable preview -> post.
 * If the AI is unavailable the preview opens empty so the reporter can fill it in by hand.
 */
export function ReportItemFlow({ userId, prefill }: { userId: string; prefill?: ReportPrefill }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [type, setType] = useState<LfType>(prefill?.type ?? "lost");
  const [text, setText] = useState(prefill?.text ?? "");
  const [building, setBuilding] = useState<string | null>(prefill?.building ?? null);
  const [spot, setSpot] = useState(prefill?.spot ?? "");
  const [when, setWhen] = useState(nowLocal);
  const [heldAt, setHeldAt] = useState<LfHeldAt | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [uploaded, setUploaded] = useState<{ blob: Blob; path: string } | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [errors, setErrors] = useState<{ text?: string; building?: string; held?: string }>({});
  const [notice, setNotice] = useState<{ tone: "warning" | "error"; messages: string[] } | null>(null);

  const [analysis, setAnalysis] = useState<LfAnalysis | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; itemNo: string } | null>(null);

  const busy = phase === "analyzing" || phase === "saving";

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

  function dropPhoto() {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    setUploaded(null);
  }

  async function uploadPhoto(): Promise<string | null> {
    if (!photo) return null;
    if (uploaded && uploaded.blob === photo.blob) return uploaded.path;
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error } = await createClient().storage.from(PHOTO_BUCKET).upload(path, photo.blob, { contentType: "image/jpeg", upsert: false });
    if (error) {
      console.error("photo upload", error);
      toast.error("Photo upload failed — continuing without the photo.");
      return null;
    }
    setUploaded({ blob: photo.blob, path });
    return path;
  }

  function toEdit(a: LfAnalysis): Edit {
    return {
      title: a.title,
      publicDescription: a.public_description,
      category: a.item_category,
      color: a.color,
      brand: a.brand,
      marks: a.marks,
      sensitive: a.sensitive,
      verificationQuestion: a.verification_question,
      verificationAnswer: "",
    };
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (text.trim().length < 3) next.text = type === "lost" ? "Describe what you lost." : "Describe what you found.";
    if (!building) next.building = "Choose where it was.";
    if (type === "found" && !heldAt) next.held = "Tell us where the item is now.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setNotice(null);
    setPhase("analyzing");
    const path = await uploadPhoto();
    setPhotoPath(path);
    const res = await postAnalyze({ type, text: text.trim(), building, spot: spot.trim() || null, photoPath: path });

    if (!res || !res.ok) {
      // AI unavailable: carry on by hand (the post is marked as not moderated).
      setAiFailed(true);
      setAnalysis(null);
      setEdit({
        title: text.trim().split(/\s+/).slice(0, 8).join(" "),
        publicDescription: "",
        category: "Other",
        color: "",
        brand: "",
        marks: "",
        sensitive: false,
        verificationQuestion: "",
        verificationAnswer: "",
      });
      setPhase("preview");
      return;
    }

    const a = res.analysis;
    const lang = a.language === "hi" ? "hi" : "en";
    const messages: string[] = [];
    let stop = false;
    if (a.moderation.text.level === "rephrase") {
      messages.push(a.moderation.text.reason || MODERATION_MESSAGES.rephrase[lang]);
      stop = true;
    } else if (a.moderation.text.level === "block") {
      messages.push([MODERATION_MESSAGES.block[lang], a.moderation.text.reason].filter(Boolean).join(" "));
      stop = true;
    }
    const p = a.moderation.photo;
    if (res.photoRemoved && p) {
      messages.push(p.level === "privacy" ? MODERATION_MESSAGES.privacy[lang] : p.reason ? `${p.reason} ${MODERATION_MESSAGES.photoRemoved[lang]}` : MODERATION_MESSAGES.photoBlock[lang]);
      dropPhoto();
      setPhotoPath(null);
      stop = true;
    }
    if (stop) {
      setNotice({ tone: a.moderation.text.level === "block" ? "error" : "warning", messages });
      setPhase("form");
      return;
    }

    setAiFailed(false);
    setAnalysis(a);
    setEdit(toEdit(a));
    if (a.location.building && !building) setBuilding(a.location.building);
    if (a.location.spot && !spot.trim()) setSpot(a.location.spot);
    setPhase("preview");
  }

  async function confirm() {
    if (!edit) return;
    setSaveError(null);
    if (edit.title.trim().length < 2) {
      setSaveError("Give the item a short title.");
      return;
    }
    setPhase("saving");
    const res = await createLostFoundItem({
      type,
      title: edit.title,
      description: text.trim(),
      publicDescription: edit.publicDescription || edit.title,
      itemCategory: edit.category,
      color: edit.color,
      brand: edit.brand,
      marks: edit.marks,
      sensitive: edit.sensitive,
      building,
      spot: spot.trim() || null,
      happenedAt: new Date(when).toISOString(),
      photoPath,
      photoAnalysis: analysis?.photo_analysis ?? null,
      heldAt: type === "found" ? heldAt : null,
      verificationQuestion: edit.verificationQuestion,
      verificationAnswer: edit.verificationAnswer,
      language: analysis?.language ?? "en",
      aiModel: analysis?.model ?? null,
      moderation: aiFailed ? "unchecked" : "passed",
    });
    if (!res.ok) {
      setSaveError(res.error);
      setPhase("preview");
      return;
    }
    setCreated({ id: res.id, itemNo: res.item_no });
    setPhase("done");
  }

  function reset() {
    dropPhoto();
    setText("");
    setSpot("");
    setHeldAt(null);
    setWhen(nowLocal());
    setAnalysis(null);
    setEdit(null);
    setCreated(null);
    setPhotoPath(null);
    setNotice(null);
    setPhase("form");
  }

  // ---------------------------------------------------------------- done
  if (phase === "done" && created) {
    return (
      <div className="animate-slide-up overflow-hidden rounded-3xl bg-surface-inverse p-7 text-center text-text-inverse shadow-xl sm:p-10">
        <AnimatedCheck className="mx-auto" />
        <p className="eyebrow mt-5 text-info-on-inverse">{type === "lost" ? "Lost item posted" : "Found item posted"}</p>
        <p className="mt-2 font-mono text-5xl font-extrabold tracking-tight sm:text-6xl">{created.itemNo}</p>
        <p className="mx-auto mt-3 max-w-md text-sm text-text-inverse-muted">
          {type === "lost"
            ? "We're comparing it with items people found in the last 14 days. If something looks like a match you'll get a notification, and you can also check the Found tab."
            : "Thank you for helping! We're comparing it with lost-item reports. If it looks like someone's item, you'll get a notification and the Security Office will contact you."}
        </p>
        {type === "found" && heldAt === "with_finder" && (
          <p className="mx-auto mt-3 max-w-md rounded-2xl bg-text-inverse/10 p-3 text-sm font-semibold">
            Please hand the item to the Security Office so the owner can collect it.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="secondary" size="lg"><Link href={`/lost-found/${created.id}`}>View my post <ArrowRight /></Link></Button>
          <Button asChild variant="secondary" size="lg"><Link href="/lost-found">Back to Lost &amp; Found</Link></Button>
          <Button variant="ghost" size="lg" className="text-text-inverse hover:bg-text-inverse/10" onClick={reset}>Post another</Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- preview
  if ((phase === "preview" || phase === "saving") && edit) {
    const set = (patch: Partial<Edit>) => setEdit({ ...edit, ...patch });
    const category = (c: string | null) => {
      if (!c || !isLfCategory(c)) return;
      set({ category: c, sensitive: edit.sensitive || LF_SENSITIVE_CATEGORIES.includes(c) });
    };
    return (
      <div className="animate-slide-up overflow-hidden rounded-3xl border border-border bg-surface shadow-lg">
        <div className="bg-surface-inverse px-5 py-5 text-text-inverse sm:px-7">
          <p className="eyebrow flex items-center gap-1.5 text-info-on-inverse">
            <Sparkles className="size-3.5" /> {aiFailed ? "Your post" : "AI listing preview"}
          </p>
          <div className="mt-2 space-y-1">
            <Label htmlFor="title" className="text-xs text-text-inverse-muted">Title</Label>
            <Input
              id="title"
              value={edit.title}
              onChange={(e) => set({ title: e.target.value })}
              maxLength={80}
              disabled={busy}
              className="border-text-inverse/20 bg-text-inverse/10 text-text-inverse placeholder:text-text-inverse-muted/70"
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <LfTypeBadge type={type} />
            <LfCategoryBadge category={edit.category} />
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          {aiFailed && (
            <p className="flex items-start gap-2 rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              Our AI assistant couldn&apos;t read this right now. Please check the details below and post it yourself.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="eyebrow">Category</Label>
              <SimpleSelect value={edit.category} onChange={category} options={LF_CATEGORIES} placeholder="Choose a category" disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="color" className="eyebrow">Colour</Label>
              <Input id="color" value={edit.color} onChange={(e) => set({ color: e.target.value })} maxLength={60} placeholder="e.g. black" disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand" className="eyebrow">Brand</Label>
              <Input id="brand" value={edit.brand} onChange={(e) => set({ brand: e.target.value })} maxLength={60} placeholder="e.g. JBL" disabled={busy} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marks" className="eyebrow">Distinguishing marks</Label>
              <Input id="marks" value={edit.marks} onChange={(e) => set({ marks: e.target.value })} maxLength={200} placeholder="Stickers, scratches, keychain…" disabled={busy} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="public" className="eyebrow">What everyone will read</Label>
            <Textarea
              id="public"
              value={edit.publicDescription}
              onChange={(e) => set({ publicDescription: e.target.value })}
              maxLength={400}
              className="min-h-20"
              placeholder="A short description. Please leave out names, ID numbers and what's inside."
              disabled={busy}
            />
            <p className="text-xs text-text-muted">Your own words stay private to you and the Security Office.</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-surface-accent p-4">
            <input
              type="checkbox"
              checked={edit.sensitive}
              onChange={(e) => set({ sensitive: e.target.checked })}
              disabled={busy}
              className="mt-1 size-4 accent-primary"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-bold text-text"><EyeOff className="size-4" /> Valuable or ID item</span>
              <span className="text-text-muted">The photo is blurred and the brand and marks are hidden from other people. Phones, wallets, laptops and ID cards are always treated this way.</span>
            </span>
          </label>

          {type === "found" && (
            <div className="space-y-3 rounded-2xl border border-border p-4">
              <p className="eyebrow flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Verification for the owner</p>
              <div className="space-y-1.5">
                <Label htmlFor="vq">Question only the owner could answer</Label>
                <Input id="vq" value={edit.verificationQuestion} onChange={(e) => set({ verificationQuestion: e.target.value })} maxLength={200} placeholder="e.g. What is the lock-screen wallpaper?" disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="va">The right answer (only you and the Security Office see this)</Label>
                <Input id="va" value={edit.verificationAnswer} onChange={(e) => set({ verificationAnswer: e.target.value })} maxLength={200} placeholder="Optional — helps the Security Office check claims" disabled={busy} />
              </div>
            </div>
          )}

          {analysis?.photo_analysis?.observed && photo && <PhotoAnalysisBox analysis={analysis.photo_analysis} />}

          <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <MapPin className="size-4" /> {[building, spot.trim()].filter(Boolean).join(" · ")}
          </div>

          {saveError && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-fg/30 bg-danger-bg p-3 text-sm font-semibold text-danger-fg">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {saveError}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={confirm} disabled={busy}>
              {phase === "saving" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {phase === "saving" ? "Posting…" : type === "lost" ? "Post lost item" : "Post found item"}
            </Button>
            <Button size="lg" variant="outline" onClick={() => setPhase("form")} disabled={busy}>
              <Pencil /> Edit my details
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- form (+ analyzing)
  return (
    <form onSubmit={submitForm} className="animate-slide-up space-y-5 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-7">
      {notice && (
        <div
          role="alert"
          className={cn(
            "flex animate-fade-in items-start gap-2.5 rounded-2xl border p-4 text-sm font-semibold",
            notice.tone === "error" ? "border-danger-fg/30 bg-danger-bg text-danger-fg" : "border-warning-fg/30 bg-warning-bg text-warning-fg",
          )}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">{notice.messages.map((m, i) => <p key={i}>{m}</p>)}</div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Lost or found">
        {(["lost", "found"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={type === t}
            disabled={busy}
            onClick={() => setType(t)}
            className={cn(
              "flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-sm font-bold transition-colors",
              type === t ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface-2 text-text-muted hover:text-text",
            )}
          >
            {t === "lost" ? <PackageSearch className="size-5" /> : <PackageCheck className="size-5" />}
            {t === "lost" ? "I lost something" : "I found something"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="what" className="eyebrow">{type === "lost" ? "What did you lose?" : "What did you find?"}</Label>
        <Textarea
          id="what"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            type === "lost"
              ? "e.g. “Black JBL earbuds in a black case, small scratch on the lid. Lost near the library” or “मेरा काला बैग गुम हो गया”"
              : "e.g. “Blue steel water bottle with a sticker, left on a bench near court 2”"
          }
          className="min-h-32 text-base"
          maxLength={1500}
          aria-invalid={!!errors.text || undefined}
          disabled={busy}
        />
        {errors.text && <p className="text-sm text-danger-fg">{errors.text}</p>}
      </div>

      <div className="space-y-3">
        <p className="eyebrow flex items-center gap-1.5"><MapPin className="size-3.5" /> Where and when</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lf-building">{type === "lost" ? "Where did you lose it?" : "Where did you find it?"}</Label>
            <SimpleSelect id="lf-building" value={building} onChange={setBuilding} options={LF_PLACES} placeholder="Choose a place" invalid={!!errors.building} disabled={busy} />
            {errors.building && <p className="text-sm text-danger-fg">{errors.building}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-spot">Exact spot (optional)</Label>
            <Input id="lf-spot" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Library, court 2, 2nd floor corridor…" maxLength={120} disabled={busy} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-when">{type === "lost" ? "When did you lose it?" : "When did you find it?"}</Label>
            <Input id="lf-when" type="datetime-local" value={when} max={nowLocal()} onChange={(e) => setWhen(e.target.value || nowLocal())} disabled={busy} />
          </div>
        </div>
      </div>

      {type === "found" && (
        <div className="space-y-2">
          <p className="eyebrow flex items-center gap-1.5"><Handshake className="size-3.5" /> Where is it now?</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Where the item is now">
            {([
              ["security_office", "I handed it to the Security Office"],
              ["with_finder", "I'm keeping it safe with me"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={heldAt === value}
                disabled={busy}
                onClick={() => setHeldAt(value)}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-colors",
                  heldAt === value ? "border-primary bg-surface-accent text-text" : "border-border bg-surface-2 text-text-muted hover:text-text",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {errors.held && <p className="text-sm text-danger-fg">{errors.held}</p>}
          <p className="text-xs text-text-muted">Valuables should be handed to the Security Office. The owner collects from there once the Security Officer has verified them.</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="eyebrow flex items-center gap-1.5"><Camera className="size-3.5" /> Photo (optional)</p>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0])} />
        {photo ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={photo.previewUrl} alt="Your photo" className="max-h-56 rounded-2xl border border-border object-cover" />
            <Button type="button" size="icon-sm" variant="secondary" className="absolute top-2 right-2 rounded-full bg-surface shadow" onClick={dropPhoto} disabled={busy} aria-label="Remove photo">
              <X />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || compressing}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-2 px-4 py-6 text-sm font-semibold text-text-muted transition-colors hover:border-accent-blue hover:text-accent-text disabled:opacity-60"
          >
            {compressing ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {compressing ? "Preparing photo…" : "Add a photo — it makes matching much better"}
          </button>
        )}
        <p className="text-xs text-text-muted">Photos of ID cards and valuables are blurred for everyone except you and the Security Office.</p>
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy || compressing}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? "AI is reading your post…" : "Continue"}
      </Button>
    </form>
  );
}
