"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PackageSearch, Search, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LF_CATEGORIES, LF_PLACES, LF_REPORTER_ROLES } from "@/config/lost-found";
import type { Role } from "@/config/roles";
import type { BoardData } from "@/lib/lost-found/queries";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ItemCard } from "./item-card";
import { LfStatusBadge } from "./item-bits";

type Tab = "lost" | "found" | "mine";

const DATE_RANGES = ["Any time", "Last 24 hours", "Last 7 days", "Last 14 days", "Last 30 days"] as const;
const RANGE_DAYS: Record<(typeof DATE_RANGES)[number], number | null> = {
  "Any time": null,
  "Last 24 hours": 1,
  "Last 7 days": 7,
  "Last 14 days": 14,
  "Last 30 days": 30,
};

/** The Lost & Found listing: Lost / Found tabs with category, place and date filters and a search box. */
export function LostFoundBoard({ data, role, initialTab }: { data: BoardData; role: Role; initialTab: Tab }) {
  const canReport = LF_REPORTER_ROLES.includes(role);
  const [tab, setTab] = useState<Tab>(canReport || initialTab !== "mine" ? initialTab : "lost");
  const [category, setCategory] = useState<string | null>(null);
  const [building, setBuilding] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof DATE_RANGES)[number]>("Any time");
  const [query, setQuery] = useState("");
  // Fixed at mount: keeps the filter pure (the page reloads data on navigation anyway).
  const [now] = useState(() => Date.now());

  const counts = useMemo(
    () => ({
      lost: data.items.filter((i) => i.type === "lost").length,
      found: data.items.filter((i) => i.type === "found").length,
      mine: data.mine.length + data.myClaims.length,
    }),
    [data],
  );

  const visible = useMemo(() => {
    if (tab === "mine") return [];
    const days = RANGE_DAYS[range];
    const since = days ? now - days * 86_400_000 : 0;
    const q = query.trim().toLowerCase();
    return data.items.filter((i) => {
      if (i.type !== tab) return false;
      if (category && i.item_category !== category) return false;
      if (building && i.building !== building) return false;
      if (since && new Date(i.happened_at).getTime() < since) return false;
      if (q) {
        const hay = [i.title, i.description, i.color, i.brand, i.marks, i.building, i.spot, i.item_category].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data.items, tab, category, building, range, query, now]);

  const filtered = !!(category || building || range !== "Any time" || query.trim());
  const clear = () => {
    setCategory(null);
    setBuilding(null);
    setRange("Any time");
    setQuery("");
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "lost", label: "Lost" },
    { id: "found", label: "Found" },
    ...(canReport ? [{ id: "mine" as const, label: "My items" }] : []),
  ];

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="Lost and found" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
              tab === t.id ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {t.label}
            <span className={cn("rounded-full px-1.5 text-xs", tab === t.id ? "bg-primary-fg/15" : "bg-surface-2")}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      {tab !== "mine" ? (
        <>
          <div className="space-y-3 rounded-3xl border border-border bg-surface p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${tab} items — "black earbuds", "bottle", "Block A"…`}
                className="pl-10"
                aria-label="Search items"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <SimpleSelect value={category} onChange={setCategory} options={LF_CATEGORIES} placeholder="Category" noneLabel="All categories" />
              <SimpleSelect value={building} onChange={setBuilding} options={LF_PLACES} placeholder="Place" noneLabel="All places" />
              <SimpleSelect value={range} onChange={(v) => setRange((v as typeof range) ?? "Any time")} options={DATE_RANGES} placeholder="Date" />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={filtered ? SearchX : PackageSearch}
              title={filtered ? "Nothing matches these filters" : `No ${tab} items right now`}
              description={
                filtered
                  ? "Try a different word, or clear the filters."
                  : tab === "lost"
                    ? "Nobody has reported anything lost recently."
                    : "Nothing has been handed in or reported found recently."
              }
              action={
                filtered ? (
                  <Button variant="outline" onClick={clear}>Clear filters</Button>
                ) : canReport ? (
                  <Button asChild><Link href={`/lost-found/report?type=${tab}`}>{tab === "lost" ? "I lost something" : "I found something"}</Link></Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((item) => (
                <li key={item.id} className="flex">
                  <ItemCard item={item} matchScore={data.matchedForMe[item.id]} className="w-full" />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="eyebrow">Items I posted</h2>
            {data.mine.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="You haven't posted anything yet"
                description="Lost something, or found something that isn't yours? Post it and we'll look for a match."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild><Link href="/lost-found/report?type=lost">I lost something</Link></Button>
                    <Button asChild variant="outline"><Link href="/lost-found/report?type=found">I found something</Link></Button>
                  </div>
                }
              />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {data.mine.map((item) => (
                  <li key={item.id} className="flex">
                    <ItemCard item={item} showType matchScore={data.matchedForMe[item.id]} className="w-full" />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.myClaims.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">My claims</h2>
              <ul className="space-y-2">
                {data.myClaims.map(({ claim, item, pickup_note }) => (
                  <li key={claim.id}>
                    <Link
                      href={`/lost-found/${item.id}`}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-accent-blue"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-text">{item.title}</p>
                        <p className="text-xs text-text-muted">{item.item_no} · claimed {timeAgo(claim.created_at)}</p>
                        {pickup_note && <p className="mt-1 text-sm font-semibold text-success-fg">{pickup_note}</p>}
                      </div>
                      <LfStatusBadge status={item.status === "returned" ? "returned" : claim.status === "approved" ? "claimed" : "open"} />
                      <span className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-text">
                        {claim.status === "pending" ? "Waiting for Security" : claim.status === "approved" ? "Approved" : "Not approved"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
