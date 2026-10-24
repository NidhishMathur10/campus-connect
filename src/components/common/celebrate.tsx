"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const COLORS = ["bg-accent-blue", "bg-accent-violet", "bg-success-solid", "bg-warning-solid", "bg-danger-solid"];

/**
 * A short, CSS-only confetti burst from the centre of its (relative) parent.
 * Purely decorative (aria-hidden) and switched off by prefers-reduced-motion.
 */
export function Confetti({ count = 22, className }: { count?: number; className?: string }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.2;
        const dist = 90 + ((i * 37) % 70);
        return {
          color: COLORS[i % COLORS.length],
          style: {
            "--cx": `${Math.round(Math.cos(angle) * dist)}px`,
            "--cy": `${Math.round(Math.sin(angle) * dist - 20)}px`,
            "--cr": `${(i * 67) % 360}deg`,
            animationDelay: `${(i % 5) * 40}ms`,
          } as React.CSSProperties,
          round: i % 2 === 0,
        };
      }),
    [count],
  );

  return (
    <span aria-hidden="true" className={cn("pointer-events-none absolute top-1/2 left-1/2 size-0 motion-reduce:hidden", className)}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={p.style}
          className={cn("absolute block h-2 w-2 animate-confetti opacity-0", p.round ? "rounded-full" : "rounded-[2px]", p.color)}
        />
      ))}
    </span>
  );
}

/** A circle that pops in with a checkmark that draws itself. */
export function AnimatedCheck({ className }: { className?: string }) {
  return (
    <span className={cn("relative grid size-16 animate-pop place-items-center rounded-full bg-success-solid text-success-solid-fg", className)}>
      <svg viewBox="0 0 24 24" fill="none" className="size-8" aria-hidden="true">
        <path
          d="m5 12.5 4.5 4.5L19 7.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="30"
          className="animate-draw"
        />
      </svg>
      <span className="fx-burst absolute inset-0 rounded-full bg-success-solid" aria-hidden="true" />
      <Confetti />
    </span>
  );
}

/** Shows a number that bumps (and floats a "+1") whenever the value goes up. */
export function Bump({ value, children }: { value: number; children?: React.ReactNode }) {
  const [prev, setPrev] = useState(value);
  const [tick, setTick] = useState(0);
  if (value !== prev) {
    setPrev(value);
    if (value > prev) setTick((t) => t + 1);
  }
  return (
    <span className="relative inline-flex">
      <span key={tick} className={tick ? "fx-bump" : undefined}>{children ?? value}</span>
      {tick > 0 && (
        <span key={`p${tick}`} aria-hidden="true" className="fx-plus-one pointer-events-none absolute -top-3 -right-3 text-xs font-extrabold text-accent-text">
          +1
        </span>
      )}
    </span>
  );
}
