"use client";

import { useRef, useState } from "react";
import { AlertCircle, Camera, ImagePlus, Loader2, MapPin, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FLOORS, getMachines, isHostelBuilding, SPOT_SUGGESTIONS } from "@/config/locations";
import { compressImage } from "@/lib/image";
import { applyBuilding, HostelPlace, type OwnRoom } from "./hostel-place";

export interface ReportDraft {
  text: string;
  building: string | null;
  floor: string | null;
  /** Free-text spot (classrooms, courts…), or the detail of an "Other" hostel common area. */
  spot: string;
  machineId: string | null;
  /** Hostel buildings: a room, or a shared (common) area. */
  place: "room" | "common";
  room: string;
  area: string | null;
  photo: { blob: Blob; previewUrl: string } | null;
}

/** Message shown above the form after moderation sent the student back to edit. */
export interface FormNotice {
  tone: "warning" | "error";
  messages: string[];
}

export const EMPTY_DRAFT: ReportDraft = {
  text: "",
  building: null,
  floor: null,
  spot: "",
  machineId: null,
  place: "room",
  room: "",
  area: null,
  photo: null,
};

export function ReportForm({
  draft,
  onChange,
  buildings,
  onSubmit,
  busy,
  textPlaceholder,
  showMachines = true,
  noBuildingLabel,
  buildingLabel = "Building",
  spotPlaceholder = "Classroom, lab, court 2, dining hall…",
  ownRoom,
  notice,
}: {
  /** Moderation message (rephrase / blocked / photo removed). The student's text, photo and location are kept. */
  notice?: FormNotice | null;
  draft: ReportDraft;
  onChange: (draft: ReportDraft) => void;
  buildings: readonly string[];
  onSubmit: () => void;
  busy: boolean;
  textPlaceholder?: string;
  showMachines?: boolean;
  /** When set, the building is optional and this is the "no building" option (e.g. attendance issues). */
  noBuildingLabel?: string;
  buildingLabel?: string;
  spotPlaceholder?: string;
  /** Hostel module: the student's own hostel + room (pre-filled, with "It's somewhere else"). */
  ownRoom?: OwnRoom;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);
  const [errors, setErrors] = useState<{ text?: string; building?: string; floor?: string; place?: string }>({});
  // Hostel module + a hostel building: room number or common area (no washroom picker).
  const hostelMode = !!ownRoom && isHostelBuilding(draft.building);
  const machines = showMachines && !hostelMode ? getMachines(draft.building, draft.floor) : [];

  const set = (patch: Partial<ReportDraft>) => onChange({ ...draft, ...patch });

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setCompressing(true);
    try {
      const blob = await compressImage(file);
      if (draft.photo) URL.revokeObjectURL(draft.photo.previewUrl);
      set({ photo: { blob, previewUrl: URL.createObjectURL(blob) } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not use this photo.");
    } finally {
      setCompressing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (draft.text.trim().length < 3) next.text = "Tell us what the problem is.";
    if (!draft.building && !noBuildingLabel) next.building = "Choose a building.";
    if (hostelMode) {
      if (!draft.floor) next.floor = "Choose the floor.";
      if (draft.place === "room" && !draft.room.trim()) next.place = "Enter the room number.";
      if (draft.place === "common" && !draft.area) next.place = "Choose the common area.";
    }
    setErrors(next);
    if (Object.keys(next).length === 0) onSubmit();
  }

  return (
    <form onSubmit={submit} className="animate-slide-up space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      {notice && notice.messages.length > 0 && (
        <div
          role="alert"
          className={`flex animate-fade-in items-start gap-2.5 rounded-2xl border p-4 text-sm font-semibold ${
            notice.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            {notice.messages.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="complaint" className="eyebrow">Your complaint</Label>
        <Textarea
          id="complaint"
          value={draft.text}
          onChange={(e) => set({ text: e.target.value })}
          placeholder={
            textPlaceholder ??
            "Describe the problem in English or Hindi — e.g. “Fan in my room makes a loud noise and stops” or “वॉशरूम में नल से पानी लीक हो रहा है”"
          }
          className="min-h-36 text-base"
          maxLength={2000}
          aria-invalid={!!errors.text || undefined}
          disabled={busy}
        />
        {errors.text && <p className="text-sm text-red-600">{errors.text}</p>}
      </div>

      <div className="space-y-3">
        <p className="eyebrow flex items-center gap-1.5"><MapPin className="size-3.5" /> Where is it?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="building">{buildingLabel}</Label>
            <SimpleSelect
              id="building"
              value={draft.building}
              onChange={(building) => onChange(applyBuilding(draft, building, ownRoom))}
              options={buildings}
              placeholder={`Choose ${buildingLabel.toLowerCase()}`}
              noneLabel={noBuildingLabel}
              invalid={!!errors.building}
              disabled={busy}
            />
            {errors.building && <p className="text-sm text-red-600">{errors.building}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="floor">Floor</Label>
            <SimpleSelect
              id="floor"
              value={draft.floor}
              onChange={(floor) => set({ floor, machineId: null })}
              options={FLOORS}
              placeholder="Choose floor"
              noneLabel={hostelMode ? undefined : "Not sure / not applicable"}
              invalid={!!errors.floor}
              disabled={busy}
            />
            {errors.floor && <p className="text-sm text-red-600">{errors.floor}</p>}
          </div>
        </div>
        {hostelMode ? (
          <HostelPlace draft={draft} own={ownRoom} onChange={set} disabled={busy} error={errors.place} />
        ) : (
        <div className="space-y-1.5">
          <Label htmlFor="spot">Exact spot</Label>
          <Input
            id="spot"
            value={draft.spot}
            onChange={(e) => set({ spot: e.target.value })}
            placeholder={spotPlaceholder}
            list="spot-suggestions"
            maxLength={120}
            disabled={busy}
          />
          <datalist id="spot-suggestions">
            {SPOT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        )}
        {machines.length > 0 && (
          <div className="animate-fade-in space-y-1.5 rounded-2xl bg-sky-tint p-3">
            <Label htmlFor="machine">Washing machine (only if it&apos;s a laundry problem)</Label>
            <SimpleSelect
              id="machine"
              value={draft.machineId}
              onChange={(machineId) => set({ machineId })}
              options={machines}
              placeholder="Choose machine ID"
              noneLabel="Not about a washing machine"
              disabled={busy}
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="eyebrow flex items-center gap-1.5"><Camera className="size-3.5" /> Photo (optional)</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickPhoto(e.target.files?.[0])}
        />
        {draft.photo ? (
          <div className="relative w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
            <img src={draft.photo.previewUrl} alt="Your photo" className="max-h-56 rounded-2xl border border-slate-200 object-cover" />
            <span className="absolute bottom-2 left-2 rounded-full bg-navy/80 px-2 py-0.5 text-xs font-semibold text-white">
              {(draft.photo.blob.size / 1024).toFixed(0)} KB
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="absolute top-2 right-2 rounded-full bg-white shadow"
              onClick={() => {
                URL.revokeObjectURL(draft.photo!.previewUrl);
                set({ photo: null });
              }}
              disabled={busy}
              aria-label="Remove photo"
            >
              <X />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || compressing}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm font-semibold text-slate-600 transition-colors hover:border-accent-blue hover:text-accent-blue disabled:opacity-60"
          >
            {compressing ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {compressing ? "Preparing photo…" : "Add a photo — it helps staff see the problem"}
          </button>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy || compressing}>
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {busy ? "Sending…" : "Submit"}
      </Button>
    </form>
  );
}
