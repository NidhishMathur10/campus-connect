"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  Copy,
  ExternalLink,
  GitMerge,
  Languages,
  Loader2,
  Lock,
  MapPin,
  FastForward,
  MessageSquarePlus,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AutoAssignedBadge, CategoryBadge, ConfidentialBadge, EscalatedBadge, FacultyBadge, NotModeratedBadge, PriorityBadge, ReassignedBadge, ScopeBadge, StatusBadge, WaitingBadge } from "@/components/common/badges";
import { DEMO_MODE } from "@/config/assignment";
import { simulateDeadlinePassed } from "@/lib/assignment-actions";
import { WhatsAppShareButton } from "@/components/common/whatsapp-share";
import { ROLE_LABELS } from "@/config/roles";
import { SimpleSelect } from "@/components/common/simple-select";
import { SafetyBadge } from "@/components/tickets/ai-bits";
import { TicketTimeline } from "@/components/tickets/ticket-timeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { categoriesFor, DEPARTMENTS, MODULE_LABELS, PRIORITIES, SECURITY_DEPARTMENTS } from "@/config/routing";
import { CONFIDENTIAL_REPORTER } from "@/config/safety";
import { ESCALATION_REASON_LABELS, STAFF_TRANSITIONS } from "@/config/statuses";
import { formatDateTime, formatLocation, formatPlace, languageName, timeAgo } from "@/lib/format";
import { canEscalateManually, type Viewer } from "@/lib/tickets/access";
import {
  addTicketNote,
  assignTicket,
  dismissDuplicate,
  escalateTicket,
  mergeDuplicate,
  overrideTicketField,
  pauseTicketSla,
  resumeTicketSla,
  wardenReopenTicket,
} from "@/lib/tickets/staff-actions";
import type { DuplicateOriginal, StaffMember, StaffTicketDetail } from "@/lib/tickets/staff-queries";
import type { FieldMeta, Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assigneeOptions, mapIds, type MoveRequest } from "./move-dialog";
import { SlaCountdown, useNow } from "./time-bits";

type ActionResult = { ok: true } | { ok: false; error: string };

function Section({ title, icon: Icon, children, className }: { title: string; icon?: typeof Sparkles; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 rounded-3xl border border-border bg-surface p-4 sm:p-5", className)}>
      <p className="eyebrow flex items-center gap-1.5">
        {Icon && <Icon className="size-3.5" />} {title}
      </p>
      {children}
    </section>
  );
}

function ConfidenceBar({ label, value, meta }: { label: string; value: string; meta?: FieldMeta }) {
  const pct = meta ? Math.round(meta.confidence * 100) : null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {pct != null && <span className="text-xs font-bold text-text-muted">{pct}%</span>}
      </div>
      <p className="text-sm font-bold text-text">{value}</p>
      {pct != null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn("h-full rounded-full", pct >= 80 ? "bg-success-fg" : pct >= 55 ? "bg-warning-fg" : "bg-danger-fg")}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {meta?.reason && <p className="text-xs text-text-muted">{meta.reason}</p>}
    </div>
  );
}

function Photo({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("block overflow-hidden rounded-2xl border border-border", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL */}
        <img src={url} alt={alt} className="h-full w-full object-cover transition-transform hover:scale-105" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[calc(100%-1rem)] rounded-3xl p-2 sm:max-w-3xl">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- Supabase storage URL */}
          <img src={url} alt={alt} className="max-h-[85dvh] w-full rounded-2xl object-contain" />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Duplicate review
// ---------------------------------------------------------------------------
function CompareColumn({
  heading,
  t,
  reporters,
}: {
  heading: string;
  t: Pick<Ticket, "ticket_no" | "title" | "summary" | "status" | "building" | "floor" | "room_no" | "spot" | "machine_id" | "photo_url" | "created_at">;
  reporters: number;
}) {
  return (
    <div className="min-w-0 space-y-2 rounded-2xl border border-warning-fg/30 bg-surface p-3 text-sm">
      <p className="eyebrow text-warning-fg">{heading}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-xs font-bold text-text">{t.ticket_no}</span>
        <StatusBadge status={t.status} className="text-[11px]" />
      </div>
      <p className="font-bold text-text">{t.title}</p>
      {t.summary && <p className="text-xs text-text-muted">{t.summary}</p>}
      <p className="flex items-start gap-1 text-xs text-text-muted"><MapPin className="mt-0.5 size-3.5 shrink-0" /> {formatLocation(t)}</p>
      <p className="flex items-center gap-1 text-xs text-text-muted"><Users className="size-3.5" /> {reporters} student{reporters === 1 ? "" : "s"}</p>
      <p className="text-xs text-text-muted">Reported {formatDateTime(t.created_at)}</p>
      {t.photo_url ? (
        <Photo url={t.photo_url} alt={`Photo on ${t.ticket_no}`} className="h-28 w-full" />
      ) : (
        <p className="rounded-xl bg-surface-2 p-2 text-center text-xs text-text-muted">No photo</p>
      )}
    </div>
  );
}

function DuplicateBanner({
  ticket,
  original,
  followerCount,
  canManage,
  run,
  onOpenTicket,
}: {
  ticket: Ticket;
  original: DuplicateOriginal | null;
  followerCount: number;
  canManage: boolean;
  run: (key: string, fn: () => Promise<ActionResult>, success: string) => void;
  onOpenTicket: (ticketNo: string) => void;
}) {
  const pct = Math.round((ticket.duplicate_score ?? 0) * 100);
  const origNo = original?.ticket_no ?? "the original";
  return (
    <div className="space-y-3 rounded-3xl border-2 border-warning-fg/30 bg-warning-bg p-4 sm:p-5">
      <div className="space-y-1">
        <p className="eyebrow flex items-center gap-1.5 text-warning-fg"><Copy className="size-3.5" /> Duplicate review</p>
        <p className="text-lg font-extrabold text-text">
          Possible duplicate of{" "}
          {original ? (
            <button type="button" onClick={() => onOpenTicket(original.ticket_no)} className="text-accent-text underline-offset-2 hover:underline">
              {original.ticket_no}
            </button>
          ) : (
            "another ticket"
          )}{" "}
          ({pct}% similar)
        </p>
        {ticket.duplicate_reason && <p className="text-sm text-warning-fg"><Sparkles className="mr-1 inline size-3.5" />{ticket.duplicate_reason}</p>}
      </div>
      {original && (
        <div className="grid gap-2 sm:grid-cols-2">
          <CompareColumn heading="This ticket" t={ticket} reporters={1 + followerCount} />
          <CompareColumn heading="Original" t={original} reporters={original.reporter_count} />
        </div>
      )}
      {canManage && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1 bg-warning-solid text-warning-solid-fg hover:brightness-90"
            disabled={!original}
            onClick={() => run("merge", () => mergeDuplicate(ticket.id), `Merged into ${origNo}`)}
          >
            <GitMerge /> Merge into {origNo}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => run("dismiss", () => dismissDuplicate(ticket.id), "Marked as not a duplicate")}>
            <XCircle /> Not a duplicate
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
type OverrideField = "category" | "department" | "priority";
const OVERRIDE_LABELS: Record<OverrideField, string> = { category: "Category", department: "Department", priority: "Priority" };

function ActionsPanel({
  detail,
  viewer,
  staff,
  run,
  busy,
  onRequestMove,
}: {
  detail: StaffTicketDetail;
  viewer: Viewer;
  staff: StaffMember[];
  run: (key: string, fn: () => Promise<ActionResult>, success: string) => void;
  busy: string | null;
  onRequestMove: (req: MoveRequest) => void;
}) {
  const { ticket } = detail;
  const closed = ticket.status === "Closed" || ticket.status === "Merged";
  const options = assigneeOptions(staff, viewer, ticket.department);
  const moves = STAFF_TRANSITIONS[ticket.status] ?? [];

  const [note, setNote] = useState("");
  const [noteVisible, setNoteVisible] = useState(false);
  const [field, setField] = useState<OverrideField>("priority");
  const [value, setValue] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [waitOpen, setWaitOpen] = useState(false);
  const [waitNote, setWaitNote] = useState("");
  const canHold = ticket.status === "In Progress" && !ticket.sla_paused_at;
  const canSimulate = DEMO_MODE && (viewer.role === "warden" || viewer.role === "dean") && !ticket.sla_paused_at;

  const valueOptions: readonly string[] =
    field === "category"
      ? categoriesFor(ticket.module)
      : field === "department"
        ? // Safety reports stay with the security departments; nothing else goes there.
          ticket.module === "security"
          ? SECURITY_DEPARTMENTS
          : DEPARTMENTS.filter((d) => !SECURITY_DEPARTMENTS.includes(d))
        : PRIORITIES;

  return (
    <Section title="Actions" icon={Wrench}>
      {closed ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">This ticket is {ticket.status.toLowerCase()} — read-only.</p>
          {viewer.role === "warden" && ticket.status === "Closed" && (
            <div className="space-y-2 rounded-2xl bg-danger-bg p-3">
              <Label htmlFor="reopen-reason" className="text-danger-fg">Reopen this ticket (warden)</Label>
              <Input
                id="reopen-reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Why? e.g. Problem is back according to the floor rep"
                maxLength={500}
                className="bg-surface"
              />
              <Button
                size="sm"
                className="bg-danger-solid hover:brightness-90"
                disabled={reopenReason.trim().length < 3 || busy === "reopen"}
                onClick={() =>
                  run(
                    "reopen",
                    async () => {
                      const res = await wardenReopenTicket(ticket.id, reopenReason);
                      if (res.ok) setReopenReason("");
                      return res;
                    },
                    "Ticket reopened",
                  )
                }
              >
                {busy === "reopen" ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reopen
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Assigned to</Label>
              <SimpleSelect
                {...mapIds(options, ticket.assigned_to, (id) =>
                  run("assign", () => assignTicket(ticket.id, id), id ? "Ticket assigned" : "Ticket unassigned"),
                )}
                options={options.map((o) => o.label)}
                placeholder="Unassigned"
                noneLabel="Unassigned"
                disabled={busy === "assign"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Move status</Label>
              <div className="flex flex-wrap gap-1.5">
                {moves.length === 0 && <p className="text-xs text-text-muted">Waiting for the student to confirm.</p>}
                {moves.map((to) => (
                  <Button key={to} size="sm" variant={to === "Resolved" ? "default" : "outline"} onClick={() => onRequestMove({ ticket, to })}>
                    <ArrowRight /> {to}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {ticket.sla_paused_at && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-fg/30 bg-neutral-bg p-3 text-sm text-neutral-fg">
              <p className="flex min-w-0 items-start gap-2 font-semibold">
                <PauseCircle className="mt-0.5 size-4 shrink-0" />
                <span>Waiting for parts / external dependency{ticket.waiting_reason ? `: ${ticket.waiting_reason}` : ""}. The SLA timer is paused.</span>
              </p>
              <Button size="sm" variant="outline" className="bg-surface text-text" disabled={busy === "resume"} onClick={() => run("resume", () => resumeTicketSla(ticket.id), "Work resumed — SLA timer running")}>
                {busy === "resume" ? <Loader2 className="animate-spin" /> : <PlayCircle />} Resume work
              </Button>
            </div>
          )}
          {(canHold || canSimulate) && (
            <div className="flex flex-wrap gap-2">
              {canHold && (
                <Button size="sm" variant="outline" onClick={() => setWaitOpen(true)}>
                  <PauseCircle /> Waiting for parts / external
                </Button>
              )}
              {canSimulate && (
                <Button
                  size="sm"
                  variant="outline"
                  title="Demo only: moves the deadline to 1 minute ago. Then use “Run SLA check now”."
                  disabled={busy === "simulate"}
                  onClick={() => run("simulate", () => simulateDeadlinePassed(ticket.id), "Deadline moved to the past — now run the SLA check")}
                >
                  {busy === "simulate" ? <Loader2 className="animate-spin" /> : <FastForward />} ⏩ Simulate deadline passed
                </Button>
              )}
            </div>
          )}
          <Dialog open={waitOpen} onOpenChange={setWaitOpen}>
            <DialogContent className="rounded-3xl sm:max-w-md">
              <DialogHeader className="text-left">
                <DialogTitle className="text-lg font-extrabold text-text">Waiting for parts / external dependency</DialogTitle>
                <DialogDescription>The SLA timer pauses until you resume work; the waiting time is added back to the deadline.</DialogDescription>
              </DialogHeader>
              <Textarea
                value={waitNote}
                onChange={(e) => setWaitNote(e.target.value)}
                placeholder="What are you waiting for? e.g. New tap washer ordered, arrives tomorrow."
                maxLength={500}
                className="min-h-24"
                autoFocus
              />
              <Button
                disabled={waitNote.trim().length < 3 || busy === "hold"}
                onClick={() =>
                  run(
                    "hold",
                    async () => {
                      const res = await pauseTicketSla(ticket.id, waitNote);
                      if (res.ok) {
                        setWaitOpen(false);
                        setWaitNote("");
                      }
                      return res;
                    },
                    "Ticket on hold — SLA timer paused",
                  )
                }
              >
                {busy === "hold" ? <Loader2 className="animate-spin" /> : <PauseCircle />} Pause the timer
              </Button>
            </DialogContent>
          </Dialog>

          <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
            <Label htmlFor="drawer-note" className="flex items-center gap-1.5"><MessageSquarePlus className="size-4" /> Add a note</Label>
            <Textarea
              id="drawer-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={noteVisible ? "Message the student sees in their timeline" : "Internal note — only staff can see this"}
              maxLength={1000}
              className="min-h-16 bg-surface"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-text-muted">
                <input type="checkbox" checked={noteVisible} onChange={(e) => setNoteVisible(e.target.checked)} className="size-4 accent-primary" />
                Visible to the student
              </label>
              <Button
                size="sm"
                disabled={note.trim().length < 2 || busy === "note"}
                onClick={() =>
                  run(
                    "note",
                    async () => {
                      const res = await addTicketNote(ticket.id, { note, internal: !noteVisible });
                      if (res.ok) setNote("");
                      return res;
                    },
                    noteVisible ? "Note sent to the student" : "Internal note added",
                  )
                }
              >
                {busy === "note" ? <Loader2 className="animate-spin" /> : noteVisible ? <MessageSquarePlus /> : <Lock />}
                {noteVisible ? "Add note" : "Add internal note"}
              </Button>
            </div>
          </div>

          <details className="group rounded-2xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-text">Correct the AI (override category / department / priority)</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <SimpleSelect
                value={OVERRIDE_LABELS[field]}
                onChange={(label) => {
                  const f = (Object.keys(OVERRIDE_LABELS) as OverrideField[]).find((k) => OVERRIDE_LABELS[k] === label);
                  if (f) {
                    setField(f);
                    setValue(null);
                  }
                }}
                options={Object.values(OVERRIDE_LABELS)}
                placeholder="Field"
              />
              <SimpleSelect value={value} onChange={setValue} options={valueOptions} placeholder={`Current: ${ticket[field]}`} />
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" maxLength={300} className="sm:col-span-2" />
              {field === "department" && (
                <p className="text-xs text-text-muted sm:col-span-2">Changing the department reroutes the ticket to that team (and releases the current assignee).</p>
              )}
              <Button
                size="sm"
                variant="outline"
                className="sm:col-span-2"
                disabled={!value || value === ticket[field] || reason.trim().length < 3 || busy === "override"}
                onClick={() =>
                  run(
                    "override",
                    async () => {
                      const res = await overrideTicketField(ticket.id, { field, value: value!, reason });
                      if (res.ok) {
                        setValue(null);
                        setReason("");
                      }
                      return res;
                    },
                    `${OVERRIDE_LABELS[field]} updated`,
                  )
                }
              >
                {busy === "override" && <Loader2 className="animate-spin" />} Save override
              </Button>
            </div>
          </details>

        </div>
      )}

    </Section>
  );
}

// ---------------------------------------------------------------------------
// Escalation (warden → Dean for hostel, HOD for academic) + links
// ---------------------------------------------------------------------------
function EscalationPanel({
  detail,
  viewer,
  run,
  busy,
}: {
  detail: StaffTicketDetail;
  viewer: Viewer;
  run: (key: string, fn: () => Promise<ActionResult>, success: string) => void;
  busy: string | null;
}) {
  const { ticket, escalations } = detail;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const canEscalate = canEscalateManually(viewer, ticket);
  const target = ticket.module === "hostel" ? "Dean" : "HOD";
  const hasActive = escalations.some((e) => e.status !== "resolved");
  if (!canEscalate && escalations.length === 0) return null;

  return (
    <Section title="Escalation" icon={ShieldAlert} className={ticket.escalated ? "border-danger-fg/30" : undefined}>
      {escalations.length > 0 && (
        <ul className="space-y-1.5">
          {escalations.map((e) => (
            <li key={e.id}>
              <Link
                href={`/escalations/${e.id}`}
                className="flex items-center justify-between gap-2 rounded-2xl border border-danger-fg/30 bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-fg hover:border-danger-fg/30"
              >
                <span className="flex items-center gap-2">
                  <ShieldAlert className="size-4" /> {ESCALATION_REASON_LABELS[e.reason]} · {e.status}
                </span>
                <ExternalLink className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canEscalate && !hasActive && ticket.status !== "Merged" && (
        <Button variant="destructive" className="w-full" onClick={() => setOpen(true)}>
          <ShieldAlert /> Escalate to {target}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="text-lg font-extrabold text-text">Escalate {ticket.ticket_no} to the {target}</DialogTitle>
            <DialogDescription>It appears in their Escalations inbox with an AI-written brief.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why does this need senior attention? e.g. Third complaint this month, needs budget approval for new pipes."
            maxLength={600}
            className="min-h-24"
            autoFocus
          />
          <Button
            variant="destructive"
            disabled={reason.trim().length < 5 || busy === "escalate"}
            onClick={() =>
              run(
                "escalate",
                async () => {
                  const res = await escalateTicket(ticket.id, reason);
                  if (res.ok) setOpen(false);
                  return res;
                },
                `Escalated to the ${target}`,
              )
            }
          >
            {busy === "escalate" ? <Loader2 className="animate-spin" /> : <ShieldAlert />} Escalate
          </Button>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------
export function TicketDrawer({
  open,
  detail,
  viewer,
  staff,
  canManage,
  onClose,
  onChanged,
  onOpenTicket,
  onRequestMove,
}: {
  open: boolean;
  /** Null while loading. */
  detail: StaffTicketDetail | null;
  viewer: Viewer;
  staff: StaffMember[];
  canManage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onOpenTicket: (ticketNo: string) => void;
  onRequestMove: (req: MoveRequest) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, fn: () => Promise<ActionResult>, success: string) {
    setBusy(key);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) {
          toast.success(success);
          onChanged();
        } else toast.error(res.error);
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setBusy(null);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto bg-page p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        {detail ? (
          <DrawerBody
            key={detail.ticket.id}
            detail={detail}
            viewer={viewer}
            staff={staff}
            canManage={canManage}
            run={run}
            busy={busy}
            onOpenTicket={onOpenTicket}
            onRequestMove={onRequestMove}
          />
        ) : (
          <div className="space-y-4 p-6">
            <SheetHeader className="p-0">
              <SheetTitle>Loading ticket…</SheetTitle>
              <SheetDescription className="sr-only">Ticket details are loading</SheetDescription>
            </SheetHeader>
            <Skeleton className="h-8 w-2/3 rounded-full" />
            <Skeleton className="h-40 w-full rounded-3xl" />
            <Skeleton className="h-60 w-full rounded-3xl" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  detail,
  viewer,
  staff,
  canManage,
  run,
  busy,
  onOpenTicket,
  onRequestMove,
}: {
  detail: StaffTicketDetail;
  viewer: Viewer;
  staff: StaffMember[];
  canManage: boolean;
  run: (key: string, fn: () => Promise<ActionResult>, success: string) => void;
  busy: string | null;
  onOpenTicket: (ticketNo: string) => void;
  onRequestMove: (req: MoveRequest) => void;
}) {
  const now = useNow();
  const { ticket, events, reporter, reporterHidden, followerCount, original } = detail;
  const ai = ticket.ai_meta;
  const translated = ticket.language !== "en" && ticket.english_text && ticket.english_text !== ticket.original_text;
  const affected = 1 + followerCount;
  const assignee = staff.find((s) => s.id === ticket.assigned_to);

  return (
    <div className="space-y-4 p-4 pb-10 sm:p-6">
      <SheetHeader className="space-y-2 p-0 pr-10">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary px-3 py-1 font-mono text-sm font-bold text-primary-fg">{ticket.ticket_no}</span>
          <span className="eyebrow">{MODULE_LABELS[ticket.module]}</span>
          {!canManage && <span className="rounded-full bg-border px-2.5 py-0.5 text-xs font-semibold text-text-muted">Read-only</span>}
        </div>
        <SheetTitle className="text-2xl font-extrabold tracking-tight text-text">{ticket.title}</SheetTitle>
        <SheetDescription asChild>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge status={ticket.status} />
              <CategoryBadge category={ticket.category} />
              <PriorityBadge priority={ticket.priority} />
              {ticket.escalated &&
                (detail.escalations[0] ? (
                  <Link href={`/escalations/${detail.escalations[0].id}`} title="Open the escalation">
                    <EscalatedBadge className="hover:brightness-90" />
                  </Link>
                ) : (
                  <EscalatedBadge />
                ))}
              <ScopeBadge scope={ticket.scope} />
              {ticket.assigned_auto && ticket.assigned_to && <AutoAssignedBadge />}
              <ReassignedBadge count={ticket.reassign_count} />
              {ticket.sla_paused_at && <WaitingBadge reason={ticket.waiting_reason} />}
              <FacultyBadge reporter={detail.faculty_reporter} />
              {ai?.is_safety_hazard && <SafetyBadge />}
              {ticket.is_confidential && <ConfidentialBadge />}
              {ai?.moderation === "unchecked" && <NotModeratedBadge />}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-muted">
              <span>Reported {formatDateTime(ticket.created_at)} ({timeAgo(ticket.created_at, now)})</span>
              <SlaCountdown dueAt={ticket.sla_due_at} startAt={ticket.sla_started_at ?? ticket.created_at} pausedAt={ticket.sla_paused_at} status={ticket.status} now={now} />
              <span>{ticket.department}{assignee ? ` · ${assignee.full_name}` : " · Unassigned"}</span>
            </div>
          </div>
        </SheetDescription>
      </SheetHeader>

      {ticket.duplicate_status === "flagged" && (
        <DuplicateBanner ticket={ticket} original={original} followerCount={followerCount} canManage={canManage} run={run} onOpenTicket={onOpenTicket} />
      )}
      {ticket.duplicate_status === "merged" && original && (
        <button
          type="button"
          onClick={() => onOpenTicket(original.ticket_no)}
          className="flex w-full items-center gap-3 rounded-3xl border border-neutral-fg/30 bg-neutral-bg p-4 text-left text-sm font-semibold text-neutral-fg hover:border-accent-blue"
        >
          <GitMerge className="size-5" /> Merged into {original.ticket_no} — open the original <ExternalLink className="ml-auto size-4" />
        </button>
      )}

      {canManage && <ActionsPanel detail={detail} viewer={viewer} staff={staff} run={run} busy={busy} onRequestMove={onRequestMove} />}
      <EscalationPanel detail={detail} viewer={viewer} run={run} busy={busy} />

      <Section title="AI analysis" icon={Sparkles}>
        {ticket.details_incomplete && (
          <p className="flex items-start gap-2 rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm text-warning-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" /> Details incomplete — the student didn&apos;t answer every follow-up question. You may need to contact them.
          </p>
        )}
        {ai?.extracted_issue && (
          <div>
            <p className="eyebrow">Extracted issue</p>
            <p className="text-sm font-semibold text-text">{ai.extracted_issue}</p>
          </div>
        )}
        <div>
          <p className="eyebrow">Summary</p>
          <p className="text-sm whitespace-pre-wrap text-text">{ticket.summary ?? ticket.english_text ?? ticket.original_text}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <ConfidenceBar label="Category" value={ticket.category} meta={ai?.category} />
          <ConfidenceBar label="Department" value={ticket.department} meta={ai?.department} />
          <ConfidenceBar label="Priority" value={ticket.priority} meta={ai?.priority} />
        </div>
        {ai?.model === "manual" && <p className="text-xs text-text-muted">AI was unavailable — the student filled these in by hand.</p>}
        {ticket.photo_analysis && (
          <div className="space-y-1 rounded-2xl bg-surface-2 p-3 text-sm">
            <p className="eyebrow flex items-center gap-1.5"><Camera className="size-3.5" /> Photo analysis</p>
            <p className="text-text"><span className="font-semibold">Observed:</span> {ticket.photo_analysis.observed}</p>
            <p className={cn("flex items-center gap-1.5 font-semibold", ticket.photo_analysis.matches_complaint ? "text-success-fg" : "text-danger-fg")}>
              {ticket.photo_analysis.matches_complaint ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {ticket.photo_analysis.matches_complaint ? "Matches the complaint" : "Doesn't match the complaint"}
            </p>
            {ticket.photo_analysis.notes && <p className="text-text-muted">{ticket.photo_analysis.notes}</p>}
          </div>
        )}
      </Section>

      <Section title={`Original complaint${translated ? ` (${languageName(ticket.language)})` : ""}`}>
        <p className="text-sm whitespace-pre-wrap text-text">{ticket.original_text}</p>
        {translated && (
          <>
            <p className="eyebrow flex items-center gap-1.5"><Languages className="size-3.5" /> English translation</p>
            <p className="text-sm text-text">{ticket.english_text}</p>
          </>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-text">
          <MapPin className="size-4 text-text-muted" />
          {formatPlace(ticket) && (
            <span className="rounded-full bg-primary px-3 py-0.5 text-sm font-bold text-primary-fg">{formatPlace(ticket)}</span>
          )}
          <span>{formatLocation({ building: ticket.building, floor: ticket.floor })}</span>
          <ScopeBadge scope={ticket.scope} />
        </div>
        {ticket.photo_url && <Photo url={ticket.photo_url} alt="Complaint photo" className="h-56 w-full sm:w-80" />}
        {!ticket.photo_url && ai?.photo_has_people && (
          <p className="flex items-center gap-2 rounded-2xl bg-surface-2 p-3 text-xs font-semibold text-text-muted">
            <Lock className="size-4 shrink-0" /> A photo showing people is attached. Only the Anti-Ragging Committee and the Dean can view it.
          </p>
        )}
      </Section>

      <Section title="Reporter" icon={User}>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-bold text-text">{reporterHidden ? CONFIDENTIAL_REPORTER : (reporter?.full_name ?? "Student")}</p>
            <p className="text-text-muted">
              {reporterHidden
                ? "The student asked to hide their name. Only the Anti-Ragging Committee and the Dean can see who reported this."
                : detail.faculty_reporter
                  ? `${ROLE_LABELS[detail.faculty_reporter.role]} (faculty)`
                  : [reporter?.roll_no && `Roll ${reporter.roll_no}`, reporter?.hostel, reporter?.wing, reporter?.room && `Room ${reporter.room}`]
                    .filter(Boolean)
                    .join(" · ") || "No profile details"}
            </p>
            {!reporterHidden && ticket.hide_identity && (
              <p className="mt-1 text-xs font-semibold text-danger-fg">Name hidden from investigating staff — you can see it as {ticket.department === "Anti-Ragging Committee" ? "the committee" : "Dean"}.</p>
            )}
          </div>
          <WhatsAppShareButton
            kind="update"
            ticket={ticket}
            phone={reporter?.phone}
            note={[...events].reverse().find((e) => e.note && !e.is_internal && (e.type === "note" || e.type === "status_change"))?.note}
            hidden={reporterHidden || ticket.is_confidential || ticket.module === "security"}
          />
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-accent px-3 py-1 text-xs font-bold text-info-fg">
            <Users className="size-3.5" /> {affected} {detail.faculty_reporter ? "reporter" : "student"}{affected === 1 ? "" : "s"} affected
          </span>
        </div>
      </Section>

      <Section title="Full history (staff view)">
        <TicketTimeline events={events} />
      </Section>
    </div>
  );
}
