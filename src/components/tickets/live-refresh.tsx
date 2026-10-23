"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * Subscribes to Supabase Realtime for one ticket (its row + its events) and
 * re-renders the server page when anything changes. RLS still applies.
 */
export function LiveRefresh({ ticketId, className }: { ticketId: string; className?: string }) {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Several events often arrive together (status + note): refresh once.
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };

    const channel = supabase
      .channel(`ticket-${ticketId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_events", filter: `ticket_id=eq.${ticketId}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` }, refresh)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [ticketId, router]);

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
