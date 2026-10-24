"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./landing.module.css";

/** Animated gradient blobs + cursor spotlight behind the hero content. */
export function HeroBackdrop({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const spot = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (spot.current) spot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      });
      setOn(true);
    };
    const leave = () => setOn(false);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <section ref={root} className="relative isolate overflow-hidden">
      <div className={s.blobs} aria-hidden="true">
        <div className={`${s.blob} ${s.blobA}`} />
        <div className={`${s.blob} ${s.blobB}`} />
        <div className={`${s.blob} ${s.blobC}`} />
        <div ref={spot} className={`${s.spot} ${on ? s.spotOn : ""}`} />
      </div>
      <div className="relative z-10">{children}</div>
    </section>
  );
}

/** Headline whose words fade/slide in one after another. */
export function AnimatedWords({ text }: { text: string }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split(" ").map((w, i) => (
          <span key={i} className={s.word} style={{ animationDelay: `${120 + i * 90}ms` }}>
            {w}
            {" "}
          </span>
        ))}
      </span>
    </>
  );
}
