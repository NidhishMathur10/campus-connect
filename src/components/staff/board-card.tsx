"use client";

import { ArrowRight, Copy, Hourglass, MapPin, MoreHorizontal, RotateCcw, Users } from "lucide-react";
import { CategoryBadge, ConfidentialBadge, EscalatedBadge, FacultyBadge, PriorityBadge, ScopeBadge } from "@/components/common/badges";
import { initials } from "@/components/shell/user-menu";
import { Stars } from "@/components/tickets/ticket-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STAFF_TRANSITIONS, type TicketStatus } from "@/config/statuses";
import { formatLocation, formatPlace } from "@/lib/format";
import type { BoardTicket } from "@/lib/tickets/staff-queries";
import { cn } from "@/lib/utils";
import { Age, isOverdue, SlaCountdown } from "./time-bits";

const PRIORITY_EDGE: Record<string, string> = {
  Urgent: "border-l-red-500",
  High: "border-l-orange-400",
  Medium: "border-l-amber-300",
  Low: "border-l-slate-300",
};

export function AssigneeAvatar({ name, className }: { name: string | null; className?: string }) {
  if (!name) {
    return (
      <span
        className={cn("grid size-7 place-items-center rounded-full border border-dashed border-slate-300 text-[10px] text-slate-400", className)}
        title="Unassigned"
      >
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-blue to-accent-violet text-[10px] font-bold text-white",
        className,
      )}
      title={`Assigned to ${name}`}
    >
      {initials(name)}
    </span>
  );
}

/** Small flag pills shared by the card and the list view. */
export function TicketFlags({ ticket, showFaculty = true }: { ticket: BoardTicket; showFaculty?: boolean }) {
  return (
    <>
      {showFaculty && <FacultyBadge reporter={ticket.faculty_reporter} compact className="px-2 text-[11px]" />}
      {ticket.status === "Reopened" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
          <RotateCcw className="size-3" /> Reopened
        </span>
      )}
      {ticket.duplicate_status === "flagged" && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700"
          title="Possible duplicate — review it"
        >
          <Copy className="size-3" /> ⚠ Duplicate?
        </span>
      )}
      <ScopeBadge scope={ticket.scope} className="px-2 text-[11px]" />
      {ticket.escalated && <EscalatedBadge className="px-2 text-[11px]" />}
      {ticket.is_confidential && <ConfidentialBadge className="px-2 text-[11px]" />}
    </>
  );
}

export function BoardCard({
  ticket,
  assigneeName,
  now,
  canManage,
  onOpen,
  onMove,
  dragging,
}: {
  ticket: BoardTicket;
  assigneeName: string | null;
  now: number;
  canManage: boolean;
  onOpen: () => void;
  onMove: (to: TicketStatus) => void;
  dragging?: boolean;
}) {
  const moves = STAFF_TRANSITIONS[ticket.status] ?? [];
  const overdue = isOverdue(ticket, now);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative w-full animate-fade-in space-y-2.5 rounded-2xl border border-l-4 border-slate-200 bg-white p-3.5 text-left shadow-sm transition-all hover:border-accent-blue hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        PRIORITY_EDGE[ticket.priority],
        overdue && "bg-red-50/40",
        dragging && "rotate-1 shadow-xl ring-2 ring-accent-blue",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-bold text-accent-blue">{ticket.ticket_no}</p>
          <p className="line-clamp-2 text-sm leading-snug font-bold text-navy">{ticket.title}</p>
        </div>
        {canManage && moves.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Move ticket"
                className="-mt-1 -mr-1 shrink-0 text-slate-400"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuLabel className="text-xs">Move to</DropdownMenuLabel>
              {moves.map((to) => (
                <DropdownMenuItem key={to} onSelect={() => onMove(to)}>
                  <ArrowRight className="size-3.5" /> {to}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <CategoryBadge category={ticket.category} className="px-2 text-[11px]" />
        <PriorityBadge priority={ticket.priority} className="px-2 text-[11px]" />
        <TicketFlags ticket={ticket} showFaculty={false} />
      </div>
      <FacultyBadge reporter={ticket.faculty_reporter} className="px-2 text-[11px]" />

      {ticket.status === "Resolved" && (
        <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800">
          <Hourglass className="size-3" /> Awaiting student confirmation
        </p>
      )}
      {ticket.status === "Closed" && (
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          {ticket.rating ? <Stars rating={ticket.rating} className="size-3.5" /> : "Closed · not rated"}
        </p>
      )}

      <p className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
        <MapPin className="size-3.5 shrink-0" />
        <span className="truncate">
          {formatPlace(ticket) && <strong className="font-bold text-navy">{formatPlace(ticket)} · </strong>}
          {formatLocation({ building: ticket.building, floor: ticket.floor })}
        </span>
      </p>

      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex min-w-0 items-center gap-2">
          <Age iso={ticket.created_at} now={now} className="whitespace-nowrap" />
          <SlaCountdown dueAt={ticket.sla_due_at} status={ticket.status} now={now} />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {ticket.follower_count > 0 && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-sky-700" title={`${ticket.follower_count + 1} students affected`}>
              <Users className="size-3.5" /> {ticket.follower_count + 1}
            </span>
          )}
          <AssigneeAvatar name={assigneeName} />
        </div>
      </div>
    </div>
  );
}
