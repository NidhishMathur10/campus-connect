"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BellOff, BadgeCheck, MessageSquare, PackageSearch, Ticket } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";
import type { AppNotification } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS = { answer: MessageSquare, comment: MessageSquare, best_answer: BadgeCheck, ticket: Ticket, lost_found: PackageSearch } as const;

/** In-app bell: latest 20 notifications, live via Realtime (RLS: own rows only). */
export function NotificationBell({ userId, align = "end" }: { userId: string; align?: "start" | "end" }) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const unread = items.filter((n) => !n.read_at).length;

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (!cancelled && data) setItems(data as AppNotification[]);
      });
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => setItems((prev) => [payload.new as AppNotification, ...prev].slice(0, 20)),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  async function markAllRead() {
    const ids = items.filter((n) => !n.read_at).map((n) => n.id);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await createClient().from("notifications").update({ read_at: now }).in("id", ids);
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && void markAllRead()}>
      <DropdownMenuTrigger className="relative grid size-10 place-items-center rounded-full text-text-muted outline-none hover:bg-surface-2 focus-visible:ring-3 focus-visible:ring-ring/50">
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 grid min-w-4.5 place-items-center rounded-full bg-danger-solid px-1 text-[10px] font-bold text-danger-solid-fg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
        <span className="sr-only">Notifications{unread ? ` (${unread} unread)` : ""}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-2">
        <DropdownMenuLabel className="px-2 py-1.5 text-sm font-bold text-text">Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-3 py-8 text-center">
            <span className="mb-3 grid size-12 place-items-center rounded-2xl bg-surface-accent text-accent-text">
              <BellOff className="size-6" />
            </span>
            <p className="text-sm font-bold text-text">You&apos;re all caught up</p>
            <p className="mt-1 text-xs text-text-muted">Ticket updates and answers to your questions will show up here.</p>
          </div>
        ) : (
          <ul className="max-h-96 space-y-0.5 overflow-y-auto">
            {items.map((n) => {
              const Icon = ICONS[n.kind] ?? Bell;
              const inner = (
                <>
                  <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", n.read_at ? "bg-surface-2 text-text-muted" : "bg-surface-accent-2 text-accent-text")}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", n.read_at ? "font-medium text-text" : "font-bold text-text")}>{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-text-muted">{n.body}</span>}
                    <span className="block text-[11px] text-text-muted">{timeAgo(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent-blue" />}
                </>
              );
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link href={n.link} className="flex gap-3 rounded-xl p-2 hover:bg-surface-accent">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex gap-3 rounded-xl p-2">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
