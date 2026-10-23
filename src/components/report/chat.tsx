"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function AiAvatar() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-blue to-accent-violet text-accent-fg shadow">
      <Sparkles className="size-4" />
    </span>
  );
}

export function Bubble({
  from,
  children,
  tone = "default",
  className,
}: {
  from: "ai" | "student";
  children: ReactNode;
  tone?: "default" | "warning";
  className?: string;
}) {
  if (from === "student") {
    return (
      <div className={cn("flex animate-slide-up justify-end", className)}>
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-3 text-sm text-primary-fg shadow-sm sm:max-w-[70%]">
          {children}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex animate-slide-up items-end gap-2", className)}>
      <AiAvatar />
      <div
        className={cn(
          "max-w-[85%] rounded-3xl rounded-bl-lg border px-4 py-3 text-sm shadow-sm sm:max-w-[70%]",
          tone === "warning"
            ? "border-warning-fg/30 bg-warning-bg text-warning-fg"
            : "border-border bg-surface text-text",
        )}
      >
        {children}
      </div>
    </div>
  );
}

const STEPS_READ = "Reading your complaint…";
const STEPS_PHOTO = "Checking the photo…";
const STEPS_ROUTE = "Finding the right department…";
const STEPS_SECOND = ["Adding your answers…", "Updating the ticket…", STEPS_ROUTE];

/** Progress steps while the AI works: finished steps get a tick, the current one pulses. */
export function AiThinking({ round, hasPhoto }: { round: 1 | 2; hasPhoto: boolean }) {
  const steps = round === 1 ? [STEPS_READ, ...(hasPhoto ? [STEPS_PHOTO] : []), STEPS_ROUTE] : STEPS_SECOND;
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 2200);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="flex animate-fade-in items-end gap-2" role="status" aria-live="polite">
      <span className="relative grid size-8 shrink-0 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent-blue/30 motion-reduce:hidden" />
        <AiAvatar />
      </span>
      <div className="min-w-0 max-w-[85%] space-y-2 rounded-3xl rounded-bl-lg border border-border bg-surface-accent px-4 py-3 text-sm sm:max-w-[70%]">
        <ul className="space-y-1.5">
          {steps.slice(0, i + 1).map((step, n) => {
            const done = n < i;
            return (
              <li key={step} className={cn("flex animate-fade-in items-center gap-2 font-semibold", done ? "text-text-muted" : "text-text")}>
                {done ? (
                  <Check className="size-4 shrink-0 text-success-fg" />
                ) : (
                  <Loader2 className="size-4 shrink-0 animate-spin text-accent-text" />
                )}
                {step}
              </li>
            );
          })}
        </ul>
        <div className="h-1 overflow-hidden rounded-full bg-surface-accent-2" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent-blue transition-all duration-700"
            style={{ width: `${Math.round(((i + 1) / (steps.length + 0.5)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

/** One-shot reply box for the single follow-up round. */
export function ChatReply({
  onSend,
  onSkip,
  busy,
  placeholder,
}: {
  onSend: (answer: string) => void;
  onSkip: () => void;
  busy: boolean;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  const send = () => value.trim() && !busy && onSend(value.trim());

  return (
    <div className="animate-slide-up space-y-2 rounded-3xl border border-border bg-surface p-3 shadow-sm">
      <div className="flex items-end gap-2">
        <Textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          className="min-h-12 border-0 bg-surface-2 focus-visible:ring-0"
          maxLength={1000}
          disabled={busy}
        />
        <Button size="icon" onClick={send} disabled={busy || !value.trim()} aria-label="Send reply">
          {busy ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
        </Button>
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={busy}
        className="px-2 text-xs font-semibold text-text-muted hover:text-text disabled:opacity-50"
      >
        Skip — I don&apos;t know / submit without these details
      </button>
    </div>
  );
}
