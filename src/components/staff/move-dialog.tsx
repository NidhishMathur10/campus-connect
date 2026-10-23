"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/common/badges";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canTransition, NOTE_REQUIRED_STATUSES, type TicketStatus } from "@/config/statuses";
import type { Viewer } from "@/lib/tickets/access";
import { changeTicketStatus } from "@/lib/tickets/staff-actions";
import type { StaffMember } from "@/lib/tickets/staff-queries";
import type { Ticket } from "@/lib/types";

export interface MoveRequest {
  ticket: Pick<Ticket, "id" | "ticket_no" | "title" | "status" | "assigned_to" | "department">;
  to: TicketStatus;
}

/** Does this move need the dialog (a note or an assignee)? */
export function moveNeedsDialog(req: MoveRequest): boolean {
  return NOTE_REQUIRED_STATUSES.includes(req.to) || (req.to === "Assigned" && !req.ticket.assigned_to);
}

const PLACEHOLDER: Partial<Record<TicketStatus, string>> = {
  "In Progress": "e.g. Plumber is on the way, will check the tap valve.",
  Resolved: "e.g. Replaced the tap washer — no more leak. Please confirm.",
  Assigned: "Optional note for the student",
};

/** Opened when a card is dropped / moved into a column that needs a note or assignee. */
export function MoveDialog({
  request,
  viewer,
  staff,
  onConfirm,
  onClose,
}: {
  request: MoveRequest | null;
  viewer: Viewer;
  staff: StaffMember[];
  onConfirm: (input: { note: string; assigneeId: string | null }) => Promise<boolean>;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        {request && (
          <MoveForm key={`${request.ticket.id}-${request.to}`} request={request} viewer={viewer} staff={staff} onConfirm={onConfirm} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MoveForm({
  request,
  viewer,
  staff,
  onConfirm,
}: {
  request: MoveRequest;
  viewer: Viewer;
  staff: StaffMember[];
  onConfirm: (input: { note: string; assigneeId: string | null }) => Promise<boolean>;
}) {
  const { ticket, to } = request;
  const needsAssignee = to === "Assigned" && !ticket.assigned_to;
  const options = assigneeOptions(staff, viewer, ticket.department);
  const [assigneeId, setAssigneeId] = useState<string | null>(
    needsAssignee && viewer.role !== "warden" ? viewer.id : null,
  );
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const noteRequired = NOTE_REQUIRED_STATUSES.includes(to);
  const valid = (!noteRequired || note.trim().length >= 3) && (!needsAssignee || !!assigneeId);

  async function submit() {
    setPending(true);
    const ok = await onConfirm({ note: note.trim(), assigneeId });
    if (!ok) setPending(false);
  }

  return (
    <>
      <DialogHeader className="text-left">
        <p className="eyebrow">{ticket.ticket_no}</p>
        <DialogTitle className="text-lg font-extrabold text-navy">{ticket.title}</DialogTitle>
        <DialogDescription asChild>
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={ticket.status} /> <ArrowRight className="size-4 text-slate-400" /> <StatusBadge status={to} />
          </div>
        </DialogDescription>
      </DialogHeader>

      {needsAssignee && (
        <div className="space-y-1.5">
          <Label>Assign to</Label>
          <SimpleSelect
            {...mapIds(options, assigneeId, setAssigneeId)}
            options={options.map((o) => o.label)}
            placeholder="Choose staff"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="move-note">
          Note for the student {noteRequired ? <span className="text-red-600">*</span> : <span className="text-slate-400">(optional)</span>}
        </Label>
        <Textarea
          id="move-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={PLACEHOLDER[to] ?? "Optional note"}
          maxLength={1000}
          className="min-h-24"
          autoFocus
        />
        <p className="text-xs text-slate-500">This appears in the student&apos;s progress history.</p>
      </div>

      <Button onClick={submit} disabled={!valid || pending} className="w-full">
        {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />} Move to {to}
      </Button>
    </>
  );
}

export interface AssigneeOption {
  id: string;
  label: string;
}

/** Department staff only — the warden may pick anyone (their department listed first). */
export function assigneeOptions(staff: StaffMember[], viewer: Viewer, department: string): AssigneeOption[] {
  const list = viewer.role === "warden" ? staff : staff.filter((s) => s.department === department);
  return [...list]
    .sort((a, b) => Number(b.department === department) - Number(a.department === department))
    .map((s) => ({
      id: s.id,
      label: viewer.role === "warden" ? `${s.full_name} · ${s.department ?? "Staff"}` : `${s.full_name}${s.id === viewer.id ? " (me)" : ""}`,
    }));
}

/** Adapts SimpleSelect (string labels) to id values. */
export function mapIds(options: AssigneeOption[], id: string | null, setId: (id: string | null) => void) {
  return {
    value: options.find((o) => o.id === id)?.label ?? null,
    onChange: (label: string | null) => setId(options.find((o) => o.label === label)?.id ?? null),
  };
}

/**
 * Status-move flow shared by the board and the history list: validates the
 * transition, opens the note/assignee dialog when needed, calls the server.
 */
export function useMoveFlow({
  viewer,
  staff,
  onOptimistic,
}: {
  viewer: Viewer;
  staff: StaffMember[];
  /** Called inside the transition so a useOptimistic update sticks until the server answers. */
  onOptimistic?: (move: { id: string; status: TicketStatus }) => void;
}) {
  const [request, setRequest] = useState<MoveRequest | null>(null);
  const [, startTransition] = useTransition();

  function run(req: MoveRequest, input: { note: string; assigneeId: string | null }): Promise<boolean> {
    return new Promise((resolve) => {
      startTransition(async () => {
        onOptimistic?.({ id: req.ticket.id, status: req.to });
        try {
          const res = await changeTicketStatus(req.ticket.id, { to: req.to, note: input.note, assigneeId: input.assigneeId });
          if (!res.ok) {
            toast.error(res.error);
            resolve(false);
            return;
          }
          toast.success(`${req.ticket.ticket_no} moved to ${req.to}`);
          setRequest(null);
          resolve(true);
        } catch {
          toast.error("Could not move the ticket. Please try again.");
          resolve(false);
        }
      });
    });
  }

  function requestMove(req: MoveRequest) {
    if (!canTransition(req.ticket.status, req.to)) {
      toast.error(`A ${req.ticket.status} ticket can't go straight to ${req.to}.`);
      return;
    }
    if (moveNeedsDialog(req)) setRequest(req);
    else void run(req, { note: "", assigneeId: null });
  }

  const dialog = (
    <MoveDialog
      request={request}
      viewer={viewer}
      staff={staff}
      onConfirm={(input) => (request ? run(request, input) : Promise.resolve(false))}
      onClose={() => setRequest(null)}
    />
  );
  return { requestMove, dialog };
}
