"use client";

import { AlertCircle, Building2, CheckCircle2, EyeOff, Languages, Loader2, Lock, MapPin, Pencil, Sparkles, Unlock } from "lucide-react";
import { CategoryBadge, PriorityBadge, ScopeBadge } from "@/components/common/badges";
import { SimpleSelect } from "@/components/common/simple-select";
import { Confidence, PhotoAnalysisBox, SafetyBadge } from "@/components/tickets/ai-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ReporterAudience } from "@/config/faculty";
import { categoriesFor, getRoutingRule, isConfidentialCategory, type Priority, type TicketModule } from "@/config/routing";
import type { TicketScope } from "@/config/locations";
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
  /** Hostel: only this room / whole floor / whole building (null = not applicable). */
  scope: TicketScope | null;
  /** Safety & Security only. */
  is_emergency: boolean;
  /** Safety & Security: the student's choice for categories where confidentiality is optional. */
  confidential_choice: boolean;
  /** Safety & Security: "Hide my name from the investigating staff". */
  hide_identity: boolean;
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
  audience = "student",
  draft,
  originalText,
  photoUrl,
  onCategoryChange,
  onTitleChange,
  onPrivacyChange,
  onConfirm,
  onEdit,
  busy,
  notice,
  confirmBlocked,
}: {
  module: TicketModule;
  /** Faculty also see the faculty-only categories (Electricity, Internet, Cleanliness). */
  audience?: ReporterAudience;
  draft: TicketDraft;
  originalText: string;
  photoUrl: string | null;
  onCategoryChange: (category: string) => void;
  onTitleChange: (title: string) => void;
  onPrivacyChange?: (patch: Pick<Partial<TicketDraft>, "confidential_choice" | "hide_identity">) => void;
  onConfirm: () => void;
  onEdit: () => void;
  busy: boolean;
  /** Shown above the buttons (the "similar open ticket found" card). */
  notice?: React.ReactNode;
  /** When set, Confirm is disabled and this text explains why. */
  confirmBlocked?: string;
}) {
  const manual = !draft.ai;
  const aiCategory = draft.ai && draft.category === draft.ai.category;
  const translated = draft.language !== "en" && draft.english_text && draft.english_text !== originalText;

  return (
    <div className="animate-slide-up overflow-hidden rounded-3xl border border-border bg-surface shadow-lg">
      <div className="bg-surface-inverse px-5 py-5 text-text-inverse sm:px-7">
        <p className="eyebrow flex items-center gap-1.5 text-info-on-inverse">
          <Sparkles className="size-3.5" /> {manual ? "Your ticket" : "AI ticket preview"}
        </p>
        {manual ? (
          <div className="mt-2 space-y-1">
            <Label htmlFor="title" className="text-xs text-text-inverse-muted">Short title</Label>
            <Input
              id="title"
              value={draft.title}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={80}
              className="border-text-inverse/20 bg-text-inverse/10 text-text-inverse placeholder:text-text-inverse-muted/70"
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
            <p className="text-text">{draft.summary}</p>
            {draft.extracted_issue && (
              <p className="text-sm text-text-muted">
                <span className="font-semibold text-text">Issue:</span> {draft.extracted_issue}
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
              options={categoriesFor(module, audience)}
              placeholder="Choose a category"
              invalid={!draft.category}
              disabled={busy}
            />
            {aiCategory && draft.ai?.reasons.category && (
              <p className="text-xs text-text-muted">{draft.ai.reasons.category}</p>
            )}
            {draft.ai && !aiCategory && (
              <p className="text-xs text-text-muted">You changed this (AI suggested {draft.ai.category}).</p>
            )}
          </section>
          <section className="space-y-1.5">
            <p className="eyebrow">Department</p>
            <p className="flex h-11 items-center gap-2 font-semibold text-text">
              <Building2 className="size-4 text-text-muted" /> {draft.category ? draft.department : "—"}
            </p>
            {aiCategory && draft.ai?.reasons.department && (
              <p className="text-xs text-text-muted">{draft.ai.reasons.department}</p>
            )}
          </section>
          <section className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Priority</p>
              {aiCategory && <Confidence value={draft.ai?.confidence.priority} />}
            </div>
            <p className="flex h-11 items-center"><PriorityBadge priority={draft.priority} className="text-sm" /></p>
            {aiCategory && draft.ai?.reasons.priority && (
              <p className="text-xs text-text-muted">{draft.ai.reasons.priority}</p>
            )}
          </section>
        </div>

        <section className="space-y-1">
          <p className="eyebrow">Location</p>
          <p className="flex items-center gap-2 text-sm font-semibold text-text">
            <MapPin className="size-4 text-text-muted" /> {formatLocation(draft.location)}
            <ScopeBadge scope={draft.scope} />
          </p>
        </section>

        {(photoUrl || draft.photo_analysis) && (
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={photoUrl} alt="Your photo" className="h-40 w-full rounded-2xl border border-border object-cover sm:w-40" />
            )}
            {draft.photo_analysis && <PhotoAnalysisBox analysis={draft.photo_analysis} />}
          </div>
        )}

        <section className="space-y-2 rounded-2xl bg-surface-2 p-4">
          <p className="eyebrow">Your words</p>
          <p className="text-sm whitespace-pre-wrap text-text">{originalText}</p>
          {translated && (
            <>
              <p className="eyebrow flex items-center gap-1.5 pt-2">
                <Languages className="size-3.5" /> English translation (from {languageName(draft.language)})
              </p>
              <p className="text-sm text-text">{draft.english_text}</p>
            </>
          )}
        </section>

        {module === "security" && draft.category && (
          <PrivacyOptions draft={draft} onChange={onPrivacyChange} disabled={busy} />
        )}

        {draft.missing_fields.length > 0 && (
          <p className="flex items-start gap-2 rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm text-warning-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            Still missing: {draft.missing_fields.join(", ")}. You can submit anyway — the ticket will be marked
            &quot;details incomplete&quot; and staff may ask you.
          </p>
        )}

        {notice}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" onClick={onEdit} disabled={busy}>
            <Pencil /> Edit complaint
          </Button>
          <Button
            size="lg"
            onClick={onConfirm}
            title={confirmBlocked}
            disabled={busy || !!confirmBlocked || !draft.category || draft.title.trim().length < 2}
          >
            {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {busy ? "Checking…" : "Confirm & submit"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Safety & Security: who will see this report, and the "hide my name" option. */
function PrivacyOptions({
  draft,
  onChange,
  disabled,
}: {
  draft: TicketDraft;
  onChange?: (patch: Pick<Partial<TicketDraft>, "confidential_choice" | "hide_identity">) => void;
  disabled: boolean;
}) {
  const mode = getRoutingRule("security", draft.category!).confidential ?? "never";
  const confidential = isConfidentialCategory(draft.category!, draft.confidential_choice);
  const toggle = "mt-0.5 size-4 shrink-0 accent-primary";

  return (
    <section className={`space-y-3 rounded-2xl border p-4 ${confidential ? "border-surface-inverse bg-surface-inverse text-text-inverse" : "border-border bg-surface-2"}`}>
      <p className={`eyebrow flex items-center gap-1.5 ${confidential ? "text-info-on-inverse" : ""}`}>
        {confidential ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        {confidential ? "Confidential report" : "Not confidential"}
      </p>
      <p className={`text-sm ${confidential ? "text-text-inverse-muted" : "text-text-muted"}`}>
        {confidential
          ? `Only you, the ${draft.department === "Anti-Ragging Committee" ? "Anti-Ragging Committee" : "assigned Security Officer"} and the Dean of Student Affairs can see this report. It never appears in public tracking or to other students.`
          : "This goes to the Security Office so they can act quickly. It never appears in public tracking."}
      </p>
      {mode === "choose" && (
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className={toggle}
            checked={draft.confidential_choice}
            onChange={(e) => onChange?.({ confidential_choice: e.target.checked, hide_identity: e.target.checked && draft.hide_identity })}
            disabled={disabled}
          />
          Keep this report confidential
        </label>
      )}
      {confidential && (
        <label className="flex items-start gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className={toggle}
            checked={draft.hide_identity}
            onChange={(e) => onChange?.({ hide_identity: e.target.checked })}
            disabled={disabled}
          />
          <span>
            <span className="flex items-center gap-1.5"><EyeOff className="size-4" /> Hide my name from the investigating staff</span>
            <span className="block text-xs font-normal text-text-inverse-muted">
              Only the Anti-Ragging Committee and the Dean will know it was you. Others see &quot;Confidential reporter&quot;.
            </span>
          </span>
        </label>
      )}
    </section>
  );
}
