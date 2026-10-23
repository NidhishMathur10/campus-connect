"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function AiAvatar() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-blue to-accent-violet text-white shadow">
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
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-sm sm:max-w-[70%]">
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
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-border bg-card text-slate-800",
        )}
      >
        {children}
      </div>
    </div>
  );
}

const STEPS_FIRST = [
  "AI is reading your complaint…",
  "Understanding the language…",
  "Checking the routing guide…",
  "Working out who should fix it…",
];
const STEPS_PHOTO = ["Looking at your photo…"];
const STEPS_SECOND = ["Adding your answers…", "Updating the ticket…"];

/** The friendly "AI is reading your complaint…" animation. */
export function AiThinking({ round, hasPhoto }: { round: 1 | 2; hasPhoto: boolean }) {
  const steps =
    round === 1 ? [STEPS_FIRST[0], ...(hasPhoto ? STEPS_PHOTO : []), ...STEPS_FIRST.slice(1)] : STEPS_SECOND;
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, steps.length - 1)), 1800);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div className="flex animate-fade-in items-end gap-2" role="status" aria-live="polite">
      <span className="relative grid size-8 shrink-0 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent-blue/30" />
        <AiAvatar />
      </span>
      <div className="rounded-3xl rounded-bl-lg border border-sky-tint-2 bg-sky-tint px-4 py-3 text-sm font-semibold text-foreground">
        <span className="flex items-center gap-2">
          <span className="flex gap-1">
            {[0, 150, 300].map((d) => (
              <span key={d} className="size-1.5 animate-bounce rounded-full bg-accent-blue" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
          <span key={i} className="animate-fade-in">{steps[i]}</span>
        </span>
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
    <div className="animate-slide-up space-y-2 rounded-3xl border border-border bg-card p-3 shadow-sm">
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
          className="min-h-12 border-0 bg-slate-50 focus-visible:ring-0"
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
        className="px-2 text-xs font-semibold text-slate-500 hover:text-foreground disabled:opacity-50"
      >
        Skip — I don&apos;t know / submit without these details
      </button>
    </div>
  );
}
