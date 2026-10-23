"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Hand, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitClaim } from "@/lib/lost-found/actions";

/** "This is mine": the owner answers the verification question (or describes a hidden detail). */
export function ClaimForm({ itemId, question }: { itemId: string; question: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await submitClaim({ itemId, answer });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Claim sent. The Security Officer will check it.");
      setOpen(false);
      setAnswer("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="lg" onClick={() => setOpen(true)}>
        <Hand /> This is mine
      </Button>
    );
  }

  return (
    <form onSubmit={send} className="animate-slide-up space-y-3 rounded-2xl border border-border bg-surface-accent p-4">
      <p className="eyebrow flex items-center gap-1.5"><ShieldCheck className="size-3.5" /> Prove it&apos;s yours</p>
      <div className="space-y-1.5">
        <Label htmlFor="claim-answer" className="text-sm font-semibold text-text">
          {question ?? "Describe something about the item that only the owner would know (a hidden mark, what's inside, the lock-screen…)."}
        </Label>
        <Textarea
          id="claim-answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="min-h-24"
          maxLength={600}
          placeholder="Your answer"
          aria-invalid={!!error || undefined}
          disabled={pending}
          autoFocus
        />
        {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
        <p className="text-xs text-text-muted">Only the Security Officer sees your answer. They may ask you to bring your college ID card.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || answer.trim().length < 3}>
          {pending && <Loader2 className="animate-spin" />} Send claim
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
      </div>
    </form>
  );
}
