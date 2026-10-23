"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Ticket } from "@/lib/types";

/**
 * Subscribes to Supabase Realtime and re-renders the server page when anything
 * changes. With `ticketId` it watches one ticket (row + events); without, it
 * watches every ticket the user can see. RLS decides what each user receives.
 */
export function useLiveTickets({
  ticketId,
  onTicketInsert,
}: {
  ticketId?: string;
  onTicketInsert?: (ticket: Ticket) => void;
} = {}): boolean {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const onInsert = useRef(onTicketInsert);
  useEffect(() => {
    onInsert.current = onTicketInsert;
  }, [onTicketInsert]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several events often arrive together (status + note): refresh once.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase
      .channel(ticketId ? `ticket-${ticketId}` : `tickets-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ticket_events", ...(ticketId ? { filter: `ticket_id=eq.${ticketId}` } : {}) },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: ticketId ? "UPDATE" : "*", schema: "public", table: "tickets", ...(ticketId ? { filter: `id=eq.${ticketId}` } : {}) },
        (payload) => {
          if (payload.eventType === "INSERT") onInsert.current?.(payload.new as Ticket);
          refresh();
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [ticketId, router]);

  return live;
}

export function LiveBadge({ live, className }: { live: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
        className,
      )}
      title={live ? "Updates appear automatically" : "Connecting to live updates…"}
    >
      <span className={cn("size-1.5 rounded-full", live ? "animate-pulse bg-emerald-500" : "bg-slate-400")} />
      {live ? "Live" : "Connecting…"}
    </span>
  );
}

/** Live badge + auto-refresh. Omit `ticketId` to watch all visible tickets. */
export function LiveRefresh({ ticketId, className }: { ticketId?: string; className?: string }) {
  const live = useLiveTickets({ ticketId });
  return <LiveBadge live={live} className={className} />;
}
