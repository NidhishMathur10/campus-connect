"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Meal } from "@/config/mess";
import { rateMeal } from "@/lib/mess/actions";
import { cn } from "@/lib/utils";

/** Stars + optional comment for one meal; saving again replaces today's rating. */
export function RateMeal({ meal, existing, onDone }: { meal: Meal; existing?: { rating: number; comment: string | null }; onDone?: (rating: number, comment: string | null) => void }) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!rating) return setError("Tap a star to rate this meal.");
    setError(null);
    start(async () => {
      const res = await rateMeal({ meal, rating, comment: comment.trim() || undefined });
      if (!res.ok) return setError(res.error);
      toast.success("Thanks for rating this meal!");
      onDone?.(rating, comment.trim() || null);
    });
  }

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={pending}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="rounded-full p-1 transition-transform hover:scale-110 active:scale-95"
          >
            <Star className={cn("size-7 transition-colors", n <= (hover || rating) ? "fill-star text-star" : "text-text-muted/40")} />
          </button>
        ))}
      </div>
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Any comment? (optional)" maxLength={500} className="min-h-16" disabled={pending} />
      {error && <p role="alert" className="text-sm font-semibold text-danger-fg">{error}</p>}
      <Button type="button" size="sm" onClick={save} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Check />} {existing ? "Update rating" : "Submit rating"}
      </Button>
    </div>
  );
}
