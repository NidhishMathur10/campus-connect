import { AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhotoAnalysis } from "@/lib/types";

/** Small "92% sure" pill used next to AI-picked fields. */
export function Confidence({ value, className }: { value: number | undefined; className?: string }) {
  if (value == null) return null;
  const pct = Math.round(value * 100);
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-bold",
        pct >= 80 ? "bg-emerald-50 text-emerald-700" : pct >= 55 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700",
        className,
      )}
      title="How sure the AI is"
    >
      {pct}% sure
    </span>
  );
}

export function PhotoAnalysisBox({ analysis }: { analysis: PhotoAnalysis }) {
  const mismatch = !analysis.matches_complaint;
  return (
    <div
      className={cn(
        "space-y-1.5 rounded-2xl border p-4 text-sm",
        mismatch ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50",
      )}
    >
      <p className="eyebrow flex items-center gap-1.5">
        <Camera className="size-3.5" /> Photo analysis
      </p>
      {mismatch ? (
        <p className="flex items-start gap-2 font-semibold text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          The photo doesn&apos;t seem to match the complaint. Please check you attached the right photo.
        </p>
      ) : (
        <p className="flex items-center gap-2 font-semibold text-emerald-700">
          <CheckCircle2 className="size-4" /> Photo matches the complaint
        </p>
      )}
      {analysis.observed && <p className="text-slate-700"><span className="font-semibold">Seen:</span> {analysis.observed}</p>}
      {analysis.notes && <p className="text-slate-600">{analysis.notes}</p>}
    </div>
  );
}

export function SafetyBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white", className)}>
      <AlertTriangle className="size-3" /> Safety hazard
    </span>
  );
}
