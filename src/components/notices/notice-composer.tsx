"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Pin, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ACADEMIC_BUILDINGS, FLOORS } from "@/config/locations";
import {
  DEFAULT_EXPIRY_DAYS,
  describeAudience,
  EVENT_GRACE_HOURS,
  HOSTEL_FLOORS,
  HOSTEL_NAMES,
  HOSTEL_WINGS,
  KNOWN_ISSUE_CATEGORIES,
  NOTICE_MODULE_LABELS,
  NOTICE_TYPE_LABELS,
  type NoticeAudience,
  type NoticeModule,
  type NoticeType,
  type PosterRule,
} from "@/config/notices";
import { QA_SUBJECTS } from "@/config/qa";
import type { ImproveNoticeResponse } from "@/app/api/ai/improve-notice/route";
import { publishNotice, updateNotice } from "@/lib/notices/actions";
import type { NoticeInput } from "@/lib/notices/input";
import { createClient } from "@/lib/supabase/client";
import type { Notice } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AttachmentPreview, attachmentName, NOTICE_TYPE_STYLES } from "./notice-bits";

const BUCKET = "notice-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALL_SUBJECTS = QA_SUBJECTS.filter((s) => s !== "Other");

/** ISO <-> `datetime-local` value in the browser's timezone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

function Chips({ options, value, onChange, disabled }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50",
              on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text-muted hover:bg-surface-2",
            )}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Compose / edit a notice. Rough text -> "Improve with AI" (title, clean body, summary, Hindi) -> the author
 * reviews and edits everything -> Publish. What each role may pick comes from POSTER_RULES.
 */
export function NoticeComposer({
  userId,
  rule,
  teacherSubjects,
  notice,
}: {
  userId: string;
  rule: PosterRule;
  teacherSubjects: string[];
  notice?: Notice;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const a = notice?.audience ?? {};

  const [type, setType] = useState<NoticeType>(notice?.type ?? "notice");
  const [module, setModule] = useState<NoticeModule>(notice?.module ?? rule.modules[0]);
  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [summary, setSummary] = useState(notice?.summary ?? "");
  const [titleHi, setTitleHi] = useState(notice?.title_hi ?? "");
  const [bodyHi, setBodyHi] = useState(notice?.body_hi ?? "");
  const [category, setCategory] = useState<string | null>(notice?.category ?? null);

  const [everyone, setEveryone] = useState(!notice || !!a.all || Object.keys(a).length === 0);
  const [buildings, setBuildings] = useState<string[]>(a.buildings ?? []);
  const [floors, setFloors] = useState<string[]>(a.floors ?? []);
  const [wings, setWings] = useState<string[]>(a.wings ?? []);
  const [subjects, setSubjects] = useState<string[]>(a.subjects ?? []);
  const [blocks, setBlocks] = useState<string[]>(a.blocks ?? []);
  const [blockFloors, setBlockFloors] = useState<string[]>(a.block_floors ?? []);

  /** undefined = keep what is saved, null = remove, string = a file uploaded just now. */
  const [attachment, setAttachment] = useState<{ path: string | null; name: string } | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [expires, setExpires] = useState(toLocalInput(notice?.expires_at));
  const [eventAt, setEventAt] = useState(toLocalInput(notice?.event_at));
  const [fixAt, setFixAt] = useState(toLocalInput(notice?.expected_fix_at));

  const [aiBusy, setAiBusy] = useState(false);
  const [aiDone, setAiDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const targeting = rule.audience === "all-only" ? "none" : module === "hostel" ? "hostel" : module === "academic" ? "academic" : "none";
  const subjectOptions = rule.ownSubjectsOnly ? ALL_SUBJECTS.filter((s) => teacherSubjects.includes(s)) : ALL_SUBJECTS;
  const categories = module === "hostel" || module === "academic" ? KNOWN_ISSUE_CATEGORIES[module] : [];

  const audience: NoticeAudience = everyone || targeting === "none"
    ? { all: true }
    : targeting === "hostel"
      ? { buildings, floors, wings }
      : { subjects, ...(type === "known_issue" ? { blocks, block_floors: blockFloors } : {}) };

  function changeModule(next: NoticeModule) {
    setModule(next);
    setEveryone(true);
    setBuildings([]); setFloors([]); setWings([]); setSubjects([]); setBlocks([]); setBlockFloors([]);
    setCategory(null);
  }

  function changeType(next: NoticeType) {
    setType(next);
    if (next !== "known_issue") setCategory(null);
  }

  async function improve() {
    if (body.trim().length < 5) {
      toast.message("Write a few words first, then let the AI polish them.");
      return;
    }
    setAiBusy(true);
    try {
      const res = await fetch("/api/ai/improve-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: title.trim() ? `${title.trim()}\n${body.trim()}` : body.trim(),
          type,
          module,
          audience: describeAudience(audience),
          category: category ?? undefined,
        }),
      });
      const data = (await res.json()) as ImproveNoticeResponse;
      if (!data.ok) {
        toast.error(data.error);
        return;
      }
      setTitle(data.notice.title);
      setBody(data.notice.body);
      setSummary(data.notice.summary);
      setTitleHi(data.notice.title_hi);
      setBodyHi(data.notice.body_hi);
      setAiDone(true);
      toast.success("AI suggestions added. Please review and edit before publishing.");
    } catch {
      toast.error("The AI couldn't improve this right now. You can still publish it yourself.");
    } finally {
      setAiBusy(false);
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    if (!/^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type)) {
      toast.error("Attach a PDF, JPG, PNG or WebP file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That file is over 10 MB.");
      return;
    }
    setUploading(true);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
      const path = `${userId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await createClient().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) {
        toast.error("Upload failed. Please try again.");
        return;
      }
      setAttachment({ path, name: file.name });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || uploading) return;
    if (type === "known_issue" && !category) return void toast.error("Pick the category this known issue is about.");
    if (type === "event" && !eventAt) return void toast.error("Add the event date and time.");
    if (!everyone && targeting !== "none") {
      const picked = targeting === "hostel" ? buildings.length + floors.length + wings.length : subjects.length + blocks.length + blockFloors.length;
      if (picked === 0) return void toast.error('Pick who this is for, or choose "Everyone".');
    }
    const input: NoticeInput = {
      module,
      type,
      title,
      title_hi: titleHi || null,
      body,
      body_hi: bodyHi || null,
      summary: summary || null,
      category: type === "known_issue" ? category : null,
      audience,
      attachment_path: attachment ? attachment.path : undefined,
      event_at: type === "event" ? fromLocalInput(eventAt) : null,
      expected_fix_at: type === "known_issue" ? fromLocalInput(fixAt) : null,
      pinned,
      expires_at: fromLocalInput(expires),
    };
    setSaving(true);
    try {
      const res = notice ? await updateNotice(notice.id, input) : await publishNotice(input);
      if (!res.ok) return void toast.error(res.error);
      toast.success(notice ? "Notice updated." : "Notice published.");
      router.push(`/notices/${notice ? notice.id : (res as { ok: true; id: string }).id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const shownAttachmentUrl = attachment === undefined ? notice?.attachment_url : null;

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <div className="flex flex-wrap gap-2">
            {rule.types.map((t) => {
              const { icon: Icon, className } = NOTICE_TYPE_STYLES[t];
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  onClick={() => changeType(t)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-bold transition-all",
                    type === t ? cn(className, "ring-2 ring-ring") : "border-border bg-surface text-text-muted hover:bg-surface-2",
                  )}
                >
                  <Icon className="size-4" /> {NOTICE_TYPE_LABELS[t]}
                </button>
              );
            })}
          </div>
          {type === "urgent" && <p className="text-xs text-text-muted">A red banner shows on every student&apos;s home and module page until they tap Got it, and everyone is emailed.</p>}
          {type === "known_issue" && <p className="text-xs text-text-muted">Students who report this problem are shown this notice and can follow it. Mark it Resolved to notify them.</p>}
        </div>

        {rule.modules.length > 1 && (
          <Field label="Shown in">
            <SimpleSelect
              value={module}
              onChange={(v) => v && changeModule(v as NoticeModule)}
              options={rule.modules}
              labels={NOTICE_MODULE_LABELS}
              placeholder="Choose a section"
            />
          </Field>
        )}

        {type === "known_issue" && (
          <Field label="Category" hint="Complaints in this category from the affected place are matched to this notice.">
            <SimpleSelect value={category} onChange={setCategory} options={categories} placeholder="What is affected?" />
          </Field>
        )}
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Water supply off — New Hostel 2nd to 5th floor" maxLength={120} required />
        </Field>
        <Field label="Notice" hint="Write it roughly. English, Hindi or Hinglish all work.">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. pani nahi aa raha new hostel 2nd se 5th floor, pipe repair chal rahi hai, shaam 6 baje tak thik ho jayega"
            className="min-h-36"
            required
          />
        </Field>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" onClick={improve} disabled={aiBusy || saving}>
            {aiBusy ? <Loader2 className="animate-spin" /> : <Sparkles />} Improve with AI
          </Button>
          <p className="text-xs text-text-muted">
            {aiBusy ? "AI is polishing your notice and writing a Hindi version…" : "Gets you a clear title, cleaned text, a one-line summary and a Hindi version to review."}
          </p>
        </div>

        {aiDone && (
          <p className="rounded-xl bg-info-bg px-3 py-2 text-sm font-semibold text-info-fg">
            AI suggestion — check the facts (dates, times, places) before you publish.
          </p>
        )}

        <Field label="One-line summary (shown in banners and alerts)">
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} placeholder="Optional" />
        </Field>

        <details className="rounded-2xl border border-border bg-surface-2 p-4" open={!!(titleHi || bodyHi)}>
          <summary className="cursor-pointer text-sm font-bold text-text">Hindi version {titleHi || bodyHi ? "" : "(optional)"}</summary>
          <div className="mt-3 space-y-3">
            <Input lang="hi" value={titleHi} onChange={(e) => setTitleHi(e.target.value)} placeholder="हिन्दी शीर्षक" maxLength={160} />
            <Textarea lang="hi" value={bodyHi} onChange={(e) => setBodyHi(e.target.value)} placeholder="हिन्दी में सूचना" className="min-h-28" />
          </div>
        </details>
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="space-y-2">
          <Label>Who is it for?</Label>
          {targeting === "none" ? (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm text-text-muted">
              {rule.audience === "all-only" ? "Campus-wide: every student sees it." : "Every student sees it."}
            </p>
          ) : (
            <>
              <div className="flex gap-2">
                {[true, false].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    aria-pressed={everyone === v}
                    onClick={() => setEveryone(v)}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-bold transition-colors",
                      everyone === v ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text-muted hover:bg-surface-2",
                    )}
                  >
                    {v ? "Everyone" : "Specific group"}
                  </button>
                ))}
              </div>
              {!everyone && targeting === "hostel" && (
                <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
                  <Field label="Hostel" hint="Leave empty for both hostels.">
                    <Chips options={HOSTEL_NAMES} value={buildings} onChange={setBuildings} />
                  </Field>
                  <Field label="Floor" hint="Leave empty for every floor. Uses the floor of each student's room.">
                    <Chips options={HOSTEL_FLOORS} value={floors} onChange={setFloors} />
                  </Field>
                  <Field label="Wing">
                    <Chips options={HOSTEL_WINGS} value={wings} onChange={setWings} />
                  </Field>
                </div>
              )}
              {!everyone && targeting === "academic" && (
                <div className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
                  <Field
                    label="Subjects"
                    hint={rule.ownSubjectsOnly ? "You can target the subjects you teach. Students see the subject on the notice." : "Students see the subject on the notice."}
                  >
                    {subjectOptions.length > 0 ? (
                      <Chips options={subjectOptions} value={subjects} onChange={setSubjects} />
                    ) : (
                      <p className="text-sm text-text-muted">No subjects are assigned to you yet. Ask the warden or HOD, or choose Everyone.</p>
                    )}
                  </Field>
                  {type === "known_issue" && (
                    <>
                      <Field label="Blocks" hint="Where the problem is. Reports from these places match this known issue.">
                        <Chips options={ACADEMIC_BUILDINGS} value={blocks} onChange={setBlocks} />
                      </Field>
                      <Field label="Floors">
                        <Chips options={FLOORS} value={blockFloors} onChange={setBlockFloors} />
                      </Field>
                    </>
                  )}
                </div>
              )}
              {!everyone && <p className="text-xs text-text-muted">Showing to: {describeAudience(audience)}</p>}
            </>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {type === "event" && (
            <Field label="Event date and time">
              <Input type="datetime-local" value={eventAt} onChange={(e) => setEventAt(e.target.value)} required />
            </Field>
          )}
          {type === "known_issue" && (
            <Field label="Expected fix time (optional)">
              <Input type="datetime-local" value={fixAt} onChange={(e) => setFixAt(e.target.value)} />
            </Field>
          )}
          <Field
            label="Expires"
            hint={
              type === "event"
                ? `Leave empty: removed ${EVENT_GRACE_HOURS} hours after the event starts.`
                : `Leave empty: removed after ${DEFAULT_EXPIRY_DAYS} days.`
            }
          >
            <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>

        <div className="space-y-2">
          <Label>Attachment (PDF or image, up to 10 MB)</Label>
          {shownAttachmentUrl && (
            <div className="space-y-2">
              <AttachmentPreview url={shownAttachmentUrl} />
              <button type="button" onClick={() => setAttachment({ path: null, name: "" })} className="text-xs font-bold text-danger-fg underline">
                Remove attachment
              </button>
            </div>
          )}
          {attachment?.path && (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3">
              <FileText className="size-5 text-text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{attachmentName(attachment.name)}</span>
              <button type="button" onClick={() => setAttachment({ path: null, name: "" })} aria-label="Remove attachment" className="grid size-8 place-items-center rounded-full hover:bg-surface">
                <X className="size-4" />
              </button>
            </div>
          )}
          {!shownAttachmentUrl && !attachment?.path && (
            <>
              <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" id="notice-file" onChange={(e) => void pickFile(e.target.files?.[0])} />
              <Button type="button" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />} Attach a file
              </Button>
            </>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-primary" />
          <Pin className="size-4 text-text-muted" />
          <span className="text-sm font-semibold text-text">Pin to the top of the notice list</span>
        </label>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || uploading || aiBusy}>
          {saving ? <Loader2 className="animate-spin" /> : <Send />} {notice ? "Save changes" : "Publish notice"}
        </Button>
      </div>
    </form>
  );
}
