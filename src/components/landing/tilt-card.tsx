"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import s from "./landing.module.css";

const MAX = 8; // degrees

/** Card that tilts toward the mouse with a moving sheen. Mouse only; touch is untouched. */
export function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(800px) rotateX(${((0.5 - py) * 2 * MAX).toFixed(2)}deg) rotateY(${((px - 0.5) * 2 * MAX).toFixed(2)}deg) translateY(-4px)`;
    el.style.setProperty("--sx", `${(px * 100).toFixed(1)}%`);
    el.style.setProperty("--sy", `${(py * 100).toFixed(1)}%`);
    setActive(true);
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = "";
    setActive(false);
  };

  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={reset} className={`${s.tilt} ${active ? s.tiltOn : ""} ${className}`}>
      <div className={s.sheen} aria-hidden="true" />
      {children}
    </div>
  );
}
