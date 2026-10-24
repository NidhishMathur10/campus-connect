"use client";

import { useState } from "react";
import { BrainCircuit, FilePenLine, Route, Ticket, type LucideIcon } from "lucide-react";
import s from "./landing.module.css";

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FilePenLine, title: "Report", text: "Describe the problem in your own words — add a photo and the place." },
  { icon: BrainCircuit, title: "AI understands", text: "Gemini reads it, asks only what's missing and writes a clear ticket." },
  { icon: Route, title: "Routed", text: "It lands with the right department at the right priority." },
  { icon: Ticket, title: "Tracked", text: "Follow every step live with your ticket number until it's fixed." },
];

const TRACK: [string, boolean][] = [
  ["Submitted", true],
  ["Assigned to Ramesh", true],
  ["In progress", false],
  ["Resolved", false],
];

const label = "text-[11px] font-bold tracking-widest text-text-muted uppercase";
const chip = "rounded-full px-2.5 py-1 text-xs font-semibold";

function Preview({ i }: { i: number }) {
  if (i === 0)
    return (
      <div className="space-y-3">
        <p className={label}>Your complaint</p>
        <p className="rounded-2xl border border-input-border bg-input-bg p-3 text-sm text-text">Tap in room 204 keeps dripping since morning, water is wasting…</p>
        <div className="flex flex-wrap gap-2">
          <span className={`${chip} bg-info-bg text-info-fg`}>New Hostel · 2nd · 204</span>
          <span className={`${chip} bg-neutral-bg text-neutral-fg`}>1 photo</span>
        </div>
      </div>
    );
  if (i === 1)
    return (
      <div className="space-y-3">
        <p className={label}>AI summary</p>
        <p className="text-base font-extrabold text-text">Dripping tap in room 204</p>
        <p className="text-sm text-text-muted">Bathroom tap leaks continuously and wastes water. Photo matches the complaint.</p>
        <div className="flex flex-wrap gap-2">
          <span className={`${chip} bg-violet-bg text-violet-fg`}>Confidence 94%</span>
          <span className={`${chip} bg-success-bg text-success-fg`}>Photo verified</span>
        </div>
      </div>
    );
  if (i === 2)
    return (
      <div className="space-y-3">
        <p className={label}>Routed to</p>
        <p className="text-base font-extrabold text-text">Estate / Maintenance</p>
        <div className="flex flex-wrap gap-2">
          <span className={`${chip} bg-info-bg text-info-fg`}>Plumbing</span>
          <span className={`${chip} bg-warning-bg text-warning-fg`}>Medium priority</span>
          <span className={`${chip} bg-neutral-bg text-neutral-fg`}>Fix in 24h</span>
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      <p className={label}>Ticket CC-1042</p>
      <ol className="space-y-2 text-sm">
        {TRACK.map(([t, done]) => (
          <li key={t} className="flex items-center gap-2.5">
            <span className={`size-2.5 rounded-full ${done ? "bg-accent-blue" : "bg-border"}`} aria-hidden="true" />
            <span className={done ? "font-semibold text-text" : "text-text-muted"}>{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Interactive "How it works": hover/tap a step to highlight it and preview a mock card. */
export function StepsDemo() {
  const [active, setActive] = useState(0);
  return (
    <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_20rem]">
      <ol className="grid gap-4 sm:grid-cols-2">
        {STEPS.map(({ icon: Icon, title, text }, i) => {
          const on = i === active;
          return (
            <li key={title}>
              <button
                type="button"
                aria-pressed={on}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className={`relative h-full w-full cursor-pointer rounded-3xl border p-6 text-left shadow-sm transition-[transform,opacity] duration-200 ${
                  on ? "-translate-y-1 border-accent-blue bg-surface-accent shadow-md" : "border-border bg-surface opacity-80 hover:opacity-100"
                }`}
              >
                <span className="absolute top-5 right-6 text-4xl font-extrabold text-border" aria-hidden="true">{i + 1}</span>
                <span className={`grid size-12 place-items-center rounded-2xl ${on ? "bg-accent-blue text-accent-fg" : "bg-primary text-primary-fg"}`}>
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-text">{title}</h3>
                <p className="mt-1 text-sm text-text-muted">{text}</p>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="rounded-3xl border border-border bg-surface p-6 shadow-md" aria-live="polite">
        <p className="eyebrow mb-4">Preview · {STEPS[active].title}</p>
        <div key={active} className={s.pop}><Preview i={active} /></div>
      </div>
    </div>
  );
}
