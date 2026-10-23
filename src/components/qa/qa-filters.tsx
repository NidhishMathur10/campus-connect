"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search, X } from "lucide-react";
import { SimpleSelect } from "@/components/common/simple-select";
import { Input } from "@/components/ui/input";
import { QA_FILTER_LABELS, QA_SUBJECTS, type QaFilter } from "@/config/qa";
import { cn } from "@/lib/utils";

/** Subject / filter / search controls. State lives in the URL so the list renders on the server. */
export function QaFilters({ filters }: { filters: QaFilter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const filter = (params.get("filter") as QaFilter | null) ?? "all";

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: q.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search questions… (press Enter)"
            className="rounded-full bg-surface pr-9 pl-10"
            maxLength={80}
            aria-label="Search questions"
          />
          {params.get("q") && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                update({ q: null });
              }}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-text-muted hover:text-text"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </form>
        <SimpleSelect
          value={params.get("subject")}
          onChange={(subject) => update({ subject })}
          options={QA_SUBJECTS}
          placeholder="All subjects"
          noneLabel="All subjects"
          className="rounded-full bg-surface sm:w-56"
        />
      </div>
      <nav className="flex w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 sm:w-fit">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => update({ filter: f === "all" ? null : f })}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap",
              f === filter ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2",
            )}
          >
            {QA_FILTER_LABELS[f]}
          </button>
        ))}
      </nav>
    </div>
  );
}
