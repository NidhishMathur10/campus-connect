"use client";

import { useEffect, useRef, useState } from "react";

/** Counts up the first number in a text like "12", "3.2 days" or "85%" once, when scrolled into view. */
export function CountText({ text }: { text: string }) {
  const m = /^(\D*)(\d+(?:\.\d+)?)(.*)$/.exec(text);
  const ref = useRef<HTMLSpanElement>(null);
  const to = m ? parseFloat(m[2]) : 0;
  const decimals = m?.[2].split(".")[1]?.length ?? 0;
  const [v, setV] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return;
    let raf = 0;
    setV(0);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 900;
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / dur);
        setV(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (!m) return <>{text}</>;
  return <span ref={ref}>{m[1]}{v.toFixed(decimals)}{m[3]}</span>;
}
