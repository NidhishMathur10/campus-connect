"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, HandHelping, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/image";
import { completeJob, needHelp, startJob, uploadJobPhoto } from "@/lib/jobs/actions";
import type { HelpKind, JobTicket } from "@/lib/jobs/types";
import { cn } from "@/lib/utils";
import { DONE_NOTE_OPTIONS, HELP_OPTIONS } from "./i18n";
import { useJobs } from "./jobs-provider";

const BIG = "h-14 rounded-2xl text-lg font-bold";

/** Start / Done / Need help for one job. Each tap shows a friendly message with a 5-second Undo. */
export function JobActions({ job }: { job: JobTicket }) {
  const { t, schedule } = useJobs();
  const [doneOpen, setDoneOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const paused = !!job.sla_paused_at;
  const working = job.status === "In Progress" && !paused;

  function start() {
    schedule({
      ticket: job,
      patch: { status: "In Progress", sla_paused_at: null, waiting_reason: null },
      message: paused ? t.savedResume : t.savedStart,
      run: () => startJob(job.id),
    });
  }

  function finish(note: string, photoPath: string | null) {
    setDoneOpen(false);
    schedule({
      ticket: job,
      patch: { status: "Resolved", resolved_at: new Date().toISOString() },
      message: t.savedDone,
      run: () => completeJob(job.id, { note, photoPath }),
    });
  }

  function help(kind: HelpKind) {
    setHelpOpen(false);
    const patch =
      kind === "parts"
        ? { status: "In Progress" as const, sla_paused_at: new Date().toISOString(), waiting_reason: "Waiting for parts" }
        : kind === "not_mine"
          ? ("gone" as const)
          : {};
    const message = { parts: t.savedParts, person: t.savedPerson, access: t.savedAccess, not_mine: t.savedNotMine }[kind];
    schedule({ ticket: job, patch, message, run: () => needHelp(job.id, kind) });
  }

  return (
    <>
      <div className={cn("grid gap-2", working ? "grid-cols-2" : "grid-cols-3")}>
        {!working && (
          <Button type="button" onClick={start} className={cn(BIG, "bg-primary text-primary-fg hover:bg-primary/90")}>
            <Play className="size-5" /> {paused ? t.resume : t.start}
          </Button>
        )}
        <Button
          type="button"
          onClick={() => setDoneOpen(true)}
          className={cn(BIG, "bg-success-solid text-success-solid-fg hover:bg-success-solid/90")}
        >
          <CheckCircle2 className="size-5" /> {t.done}
        </Button>
        <Button type="button" variant="outline" onClick={() => setHelpOpen(true)} className={cn(BIG, "border-border bg-surface text-text hover:bg-surface-2")}>
          <HandHelping className="size-5" /> {t.needHelp}
        </Button>
      </div>

      <DoneSheet open={doneOpen} onOpenChange={setDoneOpen} onConfirm={finish} />
      <HelpSheet open={helpOpen} onOpenChange={setHelpOpen} onPick={help} hideNotMine={job.module === "security"} />
    </>
  );
}

// ---------------------------------------------------------------------------
// "Done" bottom sheet: quick note + optional "after" photo
// ---------------------------------------------------------------------------
function DoneSheet({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string, photoPath: string | null) => void;
}) {
  const { t } = useJobs();
  const [choice, setChoice] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [photo, setPhoto] = useState<{ preview: string; path: string | null } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file);
      const preview = URL.createObjectURL(blob);
      setPhoto({ preview, path: null });
      const body = new FormData();
      body.append("photo", blob, "after.jpg");
      const res = await uploadJobPhoto(body);
      if (res.ok) setPhoto({ preview, path: res.path });
      else {
        toast.error(res.error);
        setPhoto(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t.failed);
      setPhoto(null);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function reset() {
    setChoice(null);
    setOther("");
    setPhoto(null);
  }

  function confirm() {
    const note = choice === "other" ? other.trim() : (choice ?? "");
    onConfirm(note, photo?.path ?? null);
    reset();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-xl overflow-y-auto rounded-t-3xl p-0">
        <SheetHeader className="p-5 pb-0">
          <SheetTitle className="text-xl font-extrabold">{t.doneTitle}</SheetTitle>
          <SheetDescription className="text-base">{t.doneHelp}</SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-5 pb-6">
          <div className="grid grid-cols-2 gap-2">
            {DONE_NOTE_OPTIONS.map((o) => (
              <Chip key={o.value} selected={choice === o.value} onClick={() => setChoice(o.value)}>
                {t[o.key]}
              </Chip>
            ))}
            <Chip selected={choice === "other"} onClick={() => setChoice("other")} className="col-span-2">
              {t.noteOther}
            </Chip>
          </div>

          {choice === "other" && (
            <textarea
              value={other}
              onChange={(e) => setOther(e.target.value)}
              maxLength={300}
              rows={2}
              autoFocus
              placeholder={t.notePlaceholder}
              className="w-full rounded-2xl border border-input-border bg-input-bg p-3 text-lg text-text placeholder:text-placeholder focus:ring-2 focus:ring-ring focus:outline-none"
            />
          )}

          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            {photo ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                <img src={photo.preview} alt="" className="size-16 rounded-xl object-cover" />
                <div className="min-w-0 flex-1 text-base font-semibold text-text">
                  {uploading ? (
                    <span className="inline-flex items-center gap-2 text-text-muted">
                      <Loader2 className="size-4 animate-spin" /> {t.uploading}
                    </span>
                  ) : (
                    t.afterPhoto
                  )}
                </div>
                <Button type="button" variant="ghost" onClick={() => setPhoto(null)} disabled={uploading} className="h-12 rounded-xl px-3">
                  <X className="size-4" /> {t.removePhoto}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="h-14 w-full rounded-2xl border-dashed border-border bg-surface text-base font-semibold text-text"
              >
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />} {t.addPhoto}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-14 rounded-2xl text-base">
              {t.cancel}
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={uploading || (choice === "other" && other.trim().length < 3)}
              className="col-span-2 h-14 rounded-2xl bg-success-solid text-lg font-bold text-success-solid-fg hover:bg-success-solid/90"
            >
              <CheckCircle2 className="size-5" /> {t.confirmDone}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Chip({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "min-h-14 rounded-2xl border px-3 text-lg font-semibold transition-colors",
        selected ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// "Need help" bottom sheet
// ---------------------------------------------------------------------------
function HelpSheet({
  open,
  onOpenChange,
  onPick,
  hideNotMine,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (kind: HelpKind) => void;
  hideNotMine: boolean;
}) {
  const { t } = useJobs();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-xl rounded-t-3xl p-0">
        <SheetHeader className="p-5 pb-0">
          <SheetTitle className="text-xl font-extrabold">{t.helpTitle}</SheetTitle>
          <SheetDescription className="sr-only">{t.helpTitle}</SheetDescription>
        </SheetHeader>
        <div className="space-y-2 px-5 pb-6">
          {HELP_OPTIONS.filter((o) => !(hideNotMine && o.kind === "not_mine")).map((o) => (
            <button
              key={o.kind}
              type="button"
              onClick={() => onPick(o.kind)}
              className="flex min-h-16 w-full flex-col items-start justify-center rounded-2xl border border-border bg-surface px-4 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="text-lg font-bold text-text">{t[o.label]}</span>
              <span className="text-sm text-text-muted">{t[o.hint]}</span>
            </button>
          ))}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-14 w-full rounded-2xl text-base">
            {t.cancel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
