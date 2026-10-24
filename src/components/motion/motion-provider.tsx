"use client";

import { useEffect } from "react";

const MAX = 5; // degrees
const SKIP = '[data-no-fx], [role="dialog"], [data-slot="sheet-content"], [data-slot="dialog-content"], nav, header, form';
const FORM_FIELDS = "input, textarea, select";

/** Cards: rounded-2xl/3xl with a shadow (or the shadcn Card), small enough to be a tile, without form fields. */
function isCardLike(el: HTMLElement): boolean {
  const cls = typeof el.className === "string" ? el.className : "";
  const tile = el.dataset.slot === "card" || (/\brounded-(2|3)xl\b/.test(cls) && /\bshadow-/.test(cls));
  return tile || el.hasAttribute("data-tilt");
}

const verdicts = new WeakMap<HTMLElement, boolean>();
function eligible(el: HTMLElement): boolean {
  const cached = verdicts.get(el);
  if (cached !== undefined) return cached;
  const r = el.getBoundingClientRect();
  const ok =
    !el.closest(SKIP) &&
    r.width >= 120 && r.width <= 720 && r.height >= 56 && r.height <= 460 &&
    !el.querySelector(FORM_FIELDS);
  verdicts.set(el, ok);
  return ok;
}

function findCard(t: EventTarget | null): HTMLElement | null {
  let el = t instanceof HTMLElement ? t : null;
  for (let i = 0; el && i < 8; i++, el = el.parentElement) {
    if (el.hasAttribute("data-fx") || isCardLike(el)) return eligible(el) ? el : null;
  }
  return null;
}

/**
 * One delegated pointer listener gives every card-like tile a subtle 3D tilt toward the mouse, a moving sheen and
 * a lift. Mouse + hover-capable devices only; never while a button is held (so Kanban drags stay untouched);
 * not at all with prefers-reduced-motion. Styles live in src/app/motion.css.
 */
export function MotionProvider() {
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    if (!mq.matches) return;
    let current: HTMLElement | null = null;
    let raf = 0;

    const clear = (el: HTMLElement | null) => {
      if (!el) return;
      el.removeAttribute("data-fx-on");
      el.style.removeProperty("--rx");
      el.style.removeProperty("--ry");
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      // a held button means a click/drag in progress: no tilt (keeps Kanban dragging clean)
      const card = e.buttons ? null : findCard(e.target);
      if (card !== current) {
        clear(current);
        current = card;
        if (card) card.setAttribute("data-fx", "");
      }
      if (!card) return;
      const { clientX, clientY } = e;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const px = (clientX - r.left) / r.width, py = (clientY - r.top) / r.height;
        card.style.setProperty("--rx", `${((0.5 - py) * 2 * MAX).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((px - 0.5) * 2 * MAX).toFixed(2)}deg`);
        card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
        card.setAttribute("data-fx-on", "");
      });
    };
    const onLeave = () => { cancelAnimationFrame(raf); clear(current); current = null; };
    const onDown = () => cancelAnimationFrame(raf); // keep the tilt state; CSS :active adds the press-down

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      clear(current);
    };
  }, []);

  return null;
}
