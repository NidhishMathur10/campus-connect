"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LangToggle({ lang, onChange, loading }: { lang: "en" | "hi"; onChange: (l: "en" | "hi") => void; loading?: boolean }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-0.5 text-xs font-bold" role="group" aria-label="Language">
      {(["en", "hi"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={lang === l}
          className={cn("rounded-full px-3 py-1 transition-colors", lang === l ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2")}
        >
          {l === "en" ? "English" : "हिन्दी"}
        </button>
      ))}
      {loading && <Loader2 className="mr-1.5 size-3 animate-spin text-text-muted" />}
    </div>
  );
}
