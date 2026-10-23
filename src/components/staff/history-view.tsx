"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { History } from "lucide-react";
import { StatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { LiveBadge, useLiveTickets } from "@/components/tickets/live-refresh";
import { canManageTicket, type Viewer } from "@/lib/tickets/access";
import type { BoardTicket, StaffMember, StaffTicketDetail } from "@/lib/tickets/staff-queries";
import { BoardCard } from "./board-card";
import { ListView } from "./board";
import { useMoveFlow } from "./move-dialog";
import { useNow } from "./time-bits";
import { TicketDrawer } from "./ticket-drawer";

/** "All tickets" table (any status) that opens the same drawer as the board. */
export function HistoryView({
  tickets,
  staff,
  viewer,
  selectedTicketNo,
  detail,
}: {
  tickets: BoardTicket[];
  staff: StaffMember[];
  viewer: Viewer;
  selectedTicketNo: string | null;
  detail: StaffTicketDetail | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(selectedTicketNo);
  const live = useLiveTickets();
  const { requestMove, dialog } = useMoveFlow({ viewer, staff });
  const staffName = useCallback((id: string | null) => staff.find((s) => s.id === id)?.full_name ?? null, [staff]);

  function go(ticketNo: string | null) {
    setSelected(ticketNo);
    const next = new URLSearchParams(params.toString());
    if (ticketNo) next.set("t", ticketNo);
    else next.delete("t");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text-muted">
          {tickets.length} ticket{tickets.length === 1 ? "" : "s"}
          {tickets.length === 300 && " (showing the newest 300 — narrow the filters)"}
        </p>
        <LiveBadge live={live} />
      </div>

      {tickets.length === 0 ? (
        <EmptyState icon={History} title="No tickets match" description="Try a wider date range or clear the filters." />
      ) : (
        <>
          <div className="hidden lg:block">
            <ListView tickets={tickets} now={now} staffName={staffName} onOpen={go} showRating />
          </div>
          <div className="space-y-2.5 lg:hidden">
            {tickets.map((t) => (
              <div key={t.id} className="space-y-1">
                <StatusBadge status={t.status} className="text-[11px]" />
                <BoardCard
                  ticket={t}
                  assigneeName={staffName(t.assigned_to)}
                  now={now}
                  canManage={false}
                  onOpen={() => go(t.ticket_no)}
                  onMove={() => {}}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <TicketDrawer
        open={!!selected}
        detail={detail && detail.ticket.ticket_no === selected ? detail : null}
        viewer={viewer}
        staff={staff}
        canManage={!!detail && canManageTicket(viewer, detail.ticket)}
        onClose={() => go(null)}
        onChanged={() => router.refresh()}
        onOpenTicket={go}
        onRequestMove={requestMove}
      />
      {dialog}
    </>
  );
}
