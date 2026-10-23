"use client";

import { AlertCircle, Building2, CheckCircle2, Languages, Loader2, MapPin, Pencil, Sparkles } from "lucide-react";
import { CategoryBadge, PriorityBadge } from "@/components/common/badges";
import { SimpleSelect } from "@/components/common/simple-select";
import { Confidence, PhotoAnalysisBox, SafetyBadge } from "@/components/tickets/ai-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { categoriesFor, type Priority, type TicketModule } from "@/config/routing";
import type { ComplaintLocation } from "@/lib/ai/complaint";
import { formatLocation, languageName } from "@/lib/format";
import type { PhotoAnalysis } from "@/lib/types";

/** Editable ticket draft shown on the preview card. */
export interface TicketDraft {
  title: string;
  summary: string;
  extracted_issue: string;
  english_text: string | null;
  language: string;
  category: string | null;
  department: string;
  priority: Priority;
  is_safety_hazard: boolean;
  photo_analysis: PhotoAnalysis | null;
  location: ComplaintLocation;
  missing_fields: string[];
  /** Only for AI drafts: what the AI said, to show confidence + reasons. */
  ai: {
    category: string;
    confidence: { category: number; department: number; priority: number };
    reasons: { category: string; department: string; priority: string };
  } | null;
}

export function PreviewCard({
  module,
  draft,
  originalText,
  photoUrl,
  onCategoryChange,
  onTitleChange,
  onConfirm,
  onEdit,
  busy,
}: {
  module: TicketModule;
  draft: TicketDraft;
  originalText: string;
  photoUrl: string | null;
  onCategoryChange: (category: string) => void;
  onTitleChange: (title: string) => void;
  onConfirm: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  const manual = !draft.ai;
  const aiCategory = draft.ai && draft.category === draft.ai.category;
  const translated = draft.language !== "en" && draft.english_text && draft.english_text !== originalText;

  return (
    <div className="animate-slide-up overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5">
      <div className="bg-navy px-5 py-5 text-white sm:px-7">
        <p className="eyebrow flex items-center gap-1.5 text-sky-300">
          <Sparkles className="size-3.5" /> {manual ? "Your ticket" : "AI ticket preview"}
        </p>
        {manual ? (
          <div className="mt-2 space-y-1">
            <Label htmlFor="title" className="text-xs text-slate-300">Short title</Label>
            <Input
              id="title"
              value={draft.title}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={80}
              className="border-white/20 bg-white/10 text-white placeholder:text-slate-400"
            />
          </div>
        ) : (
          <h2 className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl">{draft.title}</h2>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {draft.category && <CategoryBadge category={draft.category} />}
          <PriorityBadge priority={draft.priority} />
          {draft.is_safety_hazard && <SafetyBadge />}
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-7">
        {!manual && (
          <section className="space-y-1">
            <p className="eyebrow">AI summary</p>
            <p className="text-slate-800">{draft.summary}</p>
            {draft.extracted_issue && (
              <p className="text-sm text-slate-500">
                <span className="font-semibold text-slate-700">Issue:</span> {draft.extracted_issue}
              </p>
            )}
          </section>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="category" className="eyebrow">Category</Label>
              {aiCategory && <Confidence value={draft.ai?.confidence.category} />}
            </div>
            <SimpleSelect
              id="category"
              value={draft.category}
              onChange={(c) => c && onCategoryChange(c)}
              options={categoriesFor(module)}
              placeholder="Choose a category"
              invalid={!draft.category}
              disabled={busy}
            />
            {aiCategory && draft.ai?.reasons.category && (
              <p className="text-xs text-slate-500">{draft.ai.reasons.category}</p>
            )}
            {draft.ai && !aiCategory && (
              <p className="text-xs text-slate-500">You changed this (AI suggested {draft.ai.category}).</p>
            )}
          </section>
          <section className="space-y-1.5">
            <p className="eyebrow">Department</p>
            <p className="flex h-11 items-center gap-2 font-semibold text-navy">
              <Building2 className="size-4 text-slate-400" /> {draft.category ? draft.department : "—"}
            </p>
            {aiCategory && draft.ai?.reasons.department && (
              <p className="text-xs text-slate-500">{draft.ai.reasons.department}</p>
            )}
          </section>
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Priority</p>
              {aiCategory && <Confidence value={draft.ai?.confidence.priority} />}
            </div>
            <p className="flex h-11 items-center"><PriorityBadge priority={draft.priority} className="text-sm" /></p>
            {aiCategory && draft.ai?.reasons.priority && (
              <p className="text-xs text-slate-500">{draft.ai.reasons.priority}</p>
            )}
          </section>
        </div>

        <section className="space-y-1">
          <p className="eyebrow">Location</p>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <MapPin className="size-4 text-slate-400" /> {formatLocation(draft.location)}
          </p>
        </section>

        {(photoUrl || draft.photo_analysis) && (
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={photoUrl} alt="Your photo" className="h-40 w-full rounded-2xl border border-slate-200 object-cover sm:w-40" />
            )}
            {draft.photo_analysis && <PhotoAnalysisBox analysis={draft.photo_analysis} />}
          </div>
        )}

        <section className="space-y-2 rounded-2xl bg-slate-50 p-4">
          <p className="eyebrow">Your words</p>
          <p className="text-sm whitespace-pre-wrap text-slate-700">{originalText}</p>
          {translated && (
            <>
              <p className="eyebrow flex items-center gap-1.5 pt-2">
                <Languages className="size-3.5" /> English translation (from {languageName(draft.language)})
              </p>
              <p className="text-sm text-slate-700">{draft.english_text}</p>
            </>
          )}
        </section>

        {draft.missing_fields.length > 0 && (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            Still missing: {draft.missing_fields.join(", ")}. You can submit anyway — the ticket will be marked
            &quot;details incomplete&quot; and staff may ask you.
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" onClick={onEdit} disabled={busy}>
            <Pencil /> Edit complaint
          </Button>
          <Button size="lg" onClick={onConfirm} disabled={busy || !draft.category || draft.title.trim().length < 2}>
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {busy ? "Checking…" : "Confirm & submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}
