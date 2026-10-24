"use client";

import { useEffect, useMemo, useState } from "react";
import { Languages, Megaphone, Search } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { NOTICE_TYPES, NOTICE_TYPE_LABELS, type NoticeType } from "@/config/notices";
import { markNoticesSeen } from "@/lib/notices/actions";
import type { NoticeView } from "@/lib/notices/queries";
import { cn } from "@/lib/utils";
import { NoticeCard, type NoticeLang } from "./notice-card";

/** Student notice list: pinned first, search, type filter and an English / Hindi toggle. Opening it records "seen". */
export function NoticeList({ notices, highlightId }: { notices: NoticeView[]; highlightId?: string }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<NoticeType | "all">("all");
  const [lang, setLang] = useState<NoticeLang>("en");
  const hasHindi = notices.some((n) => n.body_hi);

  useEffect(() => {
    const unseen = notices.filter((n) => !n.seen).map((n) => n.id);
    if (unseen.length > 0) void markNoticesSeen(unseen);
    if (highlightId) document.getElementById(`notice-${highlightId}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per page load
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notices.filter(
      (n) =>
        (type === "all" || n.type === type) &&
        (!q || [n.title, n.title_hi, n.body, n.body_hi, n.summary, n.category, n.author_name].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [notices, query, type]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search notices" className="pl-10" aria-label="Search notices" />
        </div>
        {hasHindi && (
          <div className="flex w-fit items-center gap-1 rounded-full border border-border bg-surface p-1" role="group" aria-label="Language">
            <Languages className="mx-1.5 size-4 text-text-muted" />
            {(["en", "hi"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                aria-pressed={lang === l}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-bold transition-colors",
                  lang === l ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2",
                )}
              >
                {l === "en" ? "English" : "हिन्दी"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(["all", ...NOTICE_TYPES] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            aria-pressed={type === t}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors",
              type === t ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text-muted hover:bg-surface-2",
            )}
          >
            {t === "all" ? "All" : NOTICE_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={notices.length === 0 ? "No notices right now" : "Nothing matches"}
          description={notices.length === 0 ? "New notices, alerts and events from the college will show up here." : "Try a different search or filter."}
        />
      ) : (
        <div className="space-y-4">
          {shown.map((n) => (
            <NoticeCard key={n.id} notice={n} lang={lang} highlighted={n.id === highlightId} />
          ))}
        </div>
      )}
    </div>
  );
}
