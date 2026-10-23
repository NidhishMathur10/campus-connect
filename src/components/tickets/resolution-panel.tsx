"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, RotateCcw, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Confetti } from "@/components/common/celebrate";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { confirmFixed, reopenTicket } from "@/lib/tickets/actions";
import { cn } from "@/lib/utils";

/** Shown to the reporter while a ticket is "Resolved": confirm + rate, or reopen. */
export function ResolutionPanel({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<"yes" | "no" | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res =
        choice === "yes"
          ? await confirmFixed(ticketId, { rating, feedback: text || undefined })
          : await reopenTicket(ticketId, text);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(choice === "yes" ? "Thanks! Ticket closed." : "Ticket reopened — staff have been notified.");
      router.refresh();
    });
  }

  return (
    <div className="relative animate-slide-up space-y-4 rounded-3xl border-2 border-success-fg/30 bg-success-bg p-5">
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-3xl" />
      <Confetti count={26} className="top-6" />
      <div>
        <p className="eyebrow text-success-fg">Staff marked this resolved</p>
        <p className="mt-1 text-lg font-extrabold text-text">Is it fixed?</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant={choice === "yes" ? "default" : "outline"}
          onClick={() => setChoice("yes")}
          disabled={pending}
          className="flex-1"
        >
          <ThumbsUp /> Yes, it&apos;s fixed
        </Button>
        <Button
          variant={choice === "no" ? "default" : "outline"}
          onClick={() => setChoice("no")}
          disabled={pending}
          className={cn("flex-1", choice === "no" && "bg-danger-solid hover:brightness-90")}
        >
          <ThumbsDown /> No, reopen
        </Button>
      </div>

      {choice === "yes" && (
        <div className="animate-fade-in space-y-3">
          <div>
            <p className="text-sm font-semibold text-text">How was the service?</p>
            <div className="mt-1 flex gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className="rounded-full p-1.5 transition-transform hover:scale-110 active:scale-95"
                  disabled={pending}
                >
                  <Star
                    className={cn(
                      "size-8 transition-colors",
                      n <= (hover || rating) ? "fill-star text-star" : "text-text-muted/40",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Any feedback? (optional)"
            maxLength={500}
            className="min-h-16"
            disabled={pending}
          />
          <Button onClick={submit} disabled={pending || rating === 0} className="w-full sm:w-auto">
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Close ticket
          </Button>
        </div>
      )}

      {choice === "no" && (
        <div className="animate-fade-in space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What is still wrong?"
            maxLength={500}
            className="min-h-16"
            disabled={pending}
          />
          <Button
            onClick={submit}
            disabled={pending || text.trim().length < 3}
            className="w-full bg-danger-solid hover:brightness-90 sm:w-auto"
          >
            {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reopen ticket
          </Button>
        </div>
      )}
    </div>
  );
}
