"use client";

import { useCallback, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Copy,
  Inbox,
  Kanban,
  List,
  Loader2,
  PauseCircle,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Split,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { CategoryBadge, PriorityBadge, StatusBadge } from "@/components/common/badges";
import { EmptyState } from "@/components/common/empty-state";
import { SimpleSelect } from "@/components/common/simple-select";
import { LiveBadge, useLiveTickets } from "@/components/tickets/live-refresh";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { BUILDINGS } from "@/config/locations";
import {
  ACADEMIC_CATEGORIES,
  categoriesFor,
  DEPARTMENTS,
  HOSTEL_CATEGORIES,
  SECURITY_CATEGORIES,
  SECURITY_DEPARTMENTS,
  MODULE_LABELS,
  MODULES,
  PRIORITIES,
  TRIAGE_DEPARTMENT,
  type TicketModule,
} from "@/config/routing";
import {
  BOARD_COLUMNS,
  boardColumnOf,
  canTransition,
  CLOSED_ON_BOARD_DAYS,
  OPEN_STATUSES,
  TICKET_STATUSES,
  type TicketStatus,
} from "@/config/statuses";
import { STATUS_STYLES } from "@/config/styles";
import { formatLocation } from "@/lib/format";
import { canManageTicket, type Viewer } from "@/lib/tickets/access";
import { overrideTicketField } from "@/lib/tickets/staff-actions";
import type { BoardData, BoardTicket, StaffTicketDetail } from "@/lib/tickets/staff-queries";
import type { Ticket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Stars } from "@/components/tickets/ticket-card";
import { AssigneeAvatar, BoardCard, TicketFlags } from "./board-card";
import { useMoveFlow } from "./move-dialog";
import { Age, SlaCountdown, useNow } from "./time-bits";
import { TicketDrawer } from "./ticket-drawer";

const ALL_CATEGORIES = [...new Set<string>([...HOSTEL_CATEGORIES, ...ACADEMIC_CATEGORIES, ...SECURITY_CATEGORIES])];
const PRIORITY_RANK: Record<string, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

interface Filters {
  q: string;
  module: TicketModule | null;
  category: string | null;
  department: string | null;
  priority: string | null;
  building: string | null;
  duplicatesOnly: boolean;
  escalatedOnly: boolean;
  /** "Waiting for parts / external dependency" (SLA paused). */
  pausedOnly: boolean;
}
const NO_FILTERS: Filters = {
  q: "",
  module: null,
  category: null,
  department: null,
  priority: null,
  building: null,
  duplicatesOnly: false,
  escalatedOnly: false,
  pausedOnly: false,
};

function matches(t: BoardTicket, f: Filters): boolean {
  if (f.module && t.module !== f.module) return false;
  if (f.category && t.category !== f.category) return false;
  if (f.department && t.department !== f.department) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.building && t.building !== f.building) return false;
  if (f.duplicatesOnly && t.duplicate_status !== "flagged") return false;
  if (f.escalatedOnly && !t.escalated) return false;
  if (f.pausedOnly && !t.sla_paused_at) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = [t.ticket_no, t.title, t.summary, t.original_text, t.english_text, t.spot, t.room_no && `room ${t.room_no}`].join(" ").toLowerCase();
    const digits = q.replace(/^cc-?/, "");
    if (!hay.includes(q) && !(digits && t.ticket_no.toLowerCase().includes(digits))) return false;
  }
  return true;
}

/** Urgent first, then nearest SLA. */
function byUrgency(a: BoardTicket, b: BoardTicket): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p) return p;
  return (a.sla_due_at ?? "9").localeCompare(b.sla_due_at ?? "9");
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------
function FilterControls({
  filters,
  set,
  showModule,
  showDepartment,
  stacked,
}: {
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  showModule: boolean;
  showDepartment: boolean;
  stacked?: boolean;
}) {
  const categories =
    filters.module === "hostel"
      ? HOSTEL_CATEGORIES
      : filters.module === "academic"
        ? categoriesFor("academic")
        : filters.module === "security"
          ? SECURITY_CATEGORIES
          : ALL_CATEGORIES;
  const cls = stacked ? "w-full" : "w-40";
  const toggle = (key: "duplicatesOnly" | "escalatedOnly" | "pausedOnly", label: string, Icon: typeof Copy) => (
    <button
      type="button"
      onClick={() => set({ [key]: !filters[key] })}
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors",
        filters[key] ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text-muted hover:bg-surface-2",
      )}
      aria-pressed={filters[key]}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
  return (
    <div className={cn("flex flex-wrap gap-2", stacked && "flex-col")}>
      {showModule && (
        <SimpleSelect
          value={filters.module ? MODULE_LABELS[filters.module] : null}
          onChange={(v) => set({ module: MODULES.find((m) => MODULE_LABELS[m] === v) ?? null, category: null })}
          options={MODULES.map((m) => MODULE_LABELS[m])}
          placeholder="Module"
          noneLabel="All modules"
          className={cls}
        />
      )}
      <SimpleSelect value={filters.category} onChange={(v) => set({ category: v })} options={categories} placeholder="Category" noneLabel="All categories" className={cls} />
      {showDepartment && (
        <SimpleSelect value={filters.department} onChange={(v) => set({ department: v })} options={DEPARTMENTS} placeholder="Department" noneLabel="All departments" className={cls} />
      )}
      <SimpleSelect value={filters.priority} onChange={(v) => set({ priority: v })} options={PRIORITIES} placeholder="Priority" noneLabel="All priorities" className={cls} />
      <SimpleSelect value={filters.building} onChange={(v) => set({ building: v })} options={BUILDINGS} placeholder="Building" noneLabel="All buildings" className={cls} />
      {toggle("duplicatesOnly", "Duplicates only", Copy)}
      {toggle("escalatedOnly", "Escalated only", ShieldAlert)}
      {toggle("pausedOnly", "Waiting on parts", PauseCircle)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kanban
// ---------------------------------------------------------------------------
function DraggableCard({ id, disabled, children }: { id: string; disabled: boolean; children: React.ReactNode }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id, disabled });
  return (
    <div ref={setNodeRef} {...listeners} className={cn("touch-manipulation", isDragging && "opacity-30")}>
      {children}
    </div>
  );
}

function Column({
  status,
  count,
  dropState,
  children,
}: {
  status: TicketStatus;
  count: number;
  dropState: "idle" | "valid" | "invalid";
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[420px] flex-col rounded-3xl border bg-surface-2/80 p-2.5 transition-colors",
        dropState === "valid" ? "border-accent-blue border-dashed bg-surface-accent/60" : "border-border",
        dropState === "valid" && isOver && "bg-surface-accent-2/70 ring-2 ring-accent-blue",
        dropState === "invalid" && "opacity-60",
      )}
    >
      <div className="flex items-center justify-between px-2 pt-1 pb-3">
        <p className="flex items-center gap-2 text-sm font-extrabold text-text">
          <span className={cn("size-2 rounded-full", STATUS_STYLES[status].dot)} /> {status}
          {status === "Closed" && <span className="text-xs font-semibold text-text-muted">last {CLOSED_ON_BOARD_DAYS} days</span>}
        </p>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-bold text-text-muted shadow-sm">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------
type SortKey = "ticket_no" | "title" | "category" | "priority" | "status" | "created_at" | "sla_due_at";
const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "ticket_no", label: "Ticket" },
  { key: "title", label: "Title" },
  { key: "category", label: "Category" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "created_at", label: "Age" },
  { key: "sla_due_at", label: "SLA" },
];

function compare(a: BoardTicket, b: BoardTicket, key: SortKey): number {
  if (key === "priority") return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (key === "ticket_no") return Number(a.ticket_no.replace(/\D/g, "")) - Number(b.ticket_no.replace(/\D/g, ""));
  if (key === "status") return TICKET_STATUSES.indexOf(a.status) - TICKET_STATUSES.indexOf(b.status);
  return String(a[key] ?? "~").localeCompare(String(b[key] ?? "~"));
}

export function ListView({
  tickets,
  now,
  staffName,
  onOpen,
  showRating,
}: {
  tickets: BoardTicket[];
  now: number;
  staffName: (id: string | null) => string | null;
  onOpen: (ticketNo: string) => void;
  showRating?: boolean;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "created_at", dir: -1 });
  const rows = useMemo(() => [...tickets].sort((a, b) => compare(a, b, sort.key) * sort.dir), [tickets, sort]);
  return (
    <div className="overflow-x-auto rounded-3xl border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="border-b border-border bg-surface-2 text-left">
          <tr>
            {SORT_COLUMNS.map((c) => (
              <th key={c.key} className="px-3 py-2.5">
                <button
                  type="button"
                  className="eyebrow inline-flex items-center gap-1 hover:text-text"
                  onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}
                >
                  {c.label}
                  {sort.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                </button>
              </th>
            ))}
            <th className="eyebrow px-3 py-2.5">Location</th>
            <th className="eyebrow px-3 py-2.5">Assignee</th>
            {showRating && <th className="eyebrow px-3 py-2.5">Rating</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} onClick={() => onOpen(t.ticket_no)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-accent/60">
              <td className="px-3 py-2.5 font-mono text-xs font-bold text-accent-text">{t.ticket_no}</td>
              <td className="max-w-64 px-3 py-2.5">
                <p className="truncate font-semibold text-text">{t.title}</p>
                <div className="mt-1 flex flex-wrap gap-1"><TicketFlags ticket={t} /></div>
              </td>
              <td className="px-3 py-2.5"><CategoryBadge category={t.category} /></td>
              <td className="px-3 py-2.5"><PriorityBadge priority={t.priority} /></td>
              <td className="px-3 py-2.5"><StatusBadge status={t.status} /></td>
              <td className="px-3 py-2.5 text-xs whitespace-nowrap text-text-muted"><Age iso={t.created_at} now={now} /></td>
              <td className="px-3 py-2.5"><SlaCountdown dueAt={t.sla_due_at} startAt={t.sla_started_at ?? t.created_at} pausedAt={t.sla_paused_at} status={t.status} now={now} /></td>
              <td className="max-w-48 truncate px-3 py-2.5 text-xs text-text-muted">{formatLocation(t)}</td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <AssigneeAvatar name={staffName(t.assigned_to)} />
                  <span className="truncate">{staffName(t.assigned_to) ?? "—"}</span>
                </div>
              </td>
              {showRating && (
                <td className="px-3 py-2.5">{t.rating ? <Stars rating={t.rating} className="size-3.5" /> : <span className="text-xs text-text-muted">—</span>}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Warden triage lane ("Other" tickets)
// ---------------------------------------------------------------------------
function TriageLane({
  tickets,
  canRoute,
  onOpen,
}: {
  tickets: BoardTicket[];
  canRoute: boolean;
  onOpen: (ticketNo: string) => void;
}) {
  const [choice, setChoice] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Hostel triage never routes into the confidential safety departments.
  const targets = DEPARTMENTS.filter((d) => d !== TRIAGE_DEPARTMENT && !SECURITY_DEPARTMENTS.includes(d));

  function route(t: BoardTicket) {
    const dept = choice[t.id];
    if (!dept) return;
    setBusy(t.id);
    startTransition(async () => {
      const res = await overrideTicketField(t.id, { field: "department", value: dept, reason: "Triaged by the warden" });
      setBusy(null);
      if (res.ok) toast.success(`${t.ticket_no} sent to ${dept}`);
      else toast.error(res.error);
    });
  }

  return (
    <section className="mb-6 animate-slide-up rounded-3xl border-2 border-dashed border-violet-fg/30 bg-violet-bg/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-violet-fg"><Split className="size-3.5" /> Needs triage</p>
          <p className="text-sm text-text-muted">“Other” tickets the AI couldn&apos;t route. Pick the department that should handle each one.</p>
        </div>
        <span className="rounded-full bg-accent-2 px-2.5 py-0.5 text-xs font-bold text-accent-fg">{tickets.length}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {tickets.map((t) => (
          <div key={t.id} className="space-y-2 rounded-2xl border border-violet-fg/30 bg-surface p-3.5 shadow-sm">
            <button type="button" onClick={() => onOpen(t.ticket_no)} className="block w-full text-left">
              <p className="font-mono text-[11px] font-bold text-accent-text">{t.ticket_no}</p>
              <p className="text-sm font-bold text-text hover:text-accent-text">{t.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-text-muted">{t.summary}</p>
            </button>
            <div className="flex flex-wrap gap-1"><PriorityBadge priority={t.priority} /><TicketFlags ticket={t} /></div>
            {canRoute && (
              <div className="flex gap-2">
                <SimpleSelect
                  value={choice[t.id] ?? null}
                  onChange={(v) => setChoice((c) => ({ ...c, [t.id]: v }))}
                  options={targets}
                  placeholder="Send to department…"
                  className="h-9 flex-1"
                />
                <Button size="sm" className="h-9" disabled={!choice[t.id] || busy === t.id} onClick={() => route(t)}>
                  {busy === t.id ? <Loader2 className="animate-spin" /> : "Route"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
export function StaffBoard({
  data,
  viewer,
  selectedTicketNo,
  detail,
}: {
  data: BoardData;
  viewer: Viewer;
  selectedTicketNo: string | null;
  detail: StaffTicketDetail | null;
}) {
  const router = useRouter();
  const now = useNow();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [view, setView] = useState<"board" | "list">("board");
  const [selected, setSelected] = useState<string | null>(selectedTicketNo);
  const [activeId, setActiveId] = useState<string | null>(null);
  const justDragged = useRef(false);

  const [tickets, applyMove] = useOptimistic(data.tickets, (state, move: { id: string; status: TicketStatus }) =>
    state.map((t) => (t.id === move.id ? { ...t, status: move.status } : t)),
  );
  const { requestMove, dialog: moveDialog } = useMoveFlow({ viewer, staff: data.staff, onOptimistic: applyMove });

  const live = useLiveTickets({
    onTicketInsert: useCallback((t: Ticket) => {
      toast.info(`New ticket ${t.ticket_no} in ${t.category}`, { description: t.title });
    }, []),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const readOnly = viewer.role === "dean" || viewer.role === "hod";
  const showModule = viewer.role !== "warden" && viewer.role !== "hod";
  const showDepartment = viewer.role === "warden" || readOnly;
  const showTriage = viewer.role === "warden" || viewer.role === "dean";
  const staffName = useCallback((id: string | null) => data.staff.find((s) => s.id === id)?.full_name ?? null, [data.staff]);

  const filtered = useMemo(() => tickets.filter((t) => matches(t, filters)), [tickets, filters]);
  const isTriage = (t: BoardTicket) => showTriage && t.module === "hostel" && t.department === TRIAGE_DEPARTMENT && OPEN_STATUSES.includes(t.status);
  const triage = filtered.filter(isTriage);
  const boardTickets = filtered.filter((t) => !isTriage(t));
  const activeTicket = activeId ? tickets.find((t) => t.id === activeId) ?? null : null;
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => k !== "q" && v).length;

  function setFilter(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  function openTicket(ticketNo: string) {
    if (justDragged.current) return;
    setSelected(ticketNo);
    router.replace(`/staff?t=${encodeURIComponent(ticketNo)}`, { scroll: false });
  }
  function closeTicket() {
    setSelected(null);
    router.replace("/staff", { scroll: false });
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 150);
    const t = tickets.find((x) => x.id === e.active.id);
    const to = e.over?.id as TicketStatus | undefined;
    if (!t || !to || boardColumnOf(t.status) === to) return;
    requestMove({ ticket: t, to });
  }

  const stats = [
    { label: "Open", value: data.stats.open, icon: Inbox, tone: "text-text", onClick: () => setFilters(NO_FILTERS) },
    { label: "Urgent", value: data.stats.urgent, icon: ShieldAlert, tone: "text-danger-fg", onClick: () => setFilter({ priority: filters.priority === "Urgent" ? null : "Urgent" }) },
    { label: "Possible duplicates", value: data.stats.duplicates, icon: Copy, tone: "text-warning-fg", onClick: () => setFilter({ duplicatesOnly: !filters.duplicatesOnly }) },
    { label: "Resolved today", value: data.stats.resolvedToday, icon: CircleCheck, tone: "text-success-fg" },
  ];
  const mine = data.stats.mine;

  const cardFor = (t: BoardTicket, dragging = false) => (
    <BoardCard
      ticket={t}
      assigneeName={staffName(t.assigned_to)}
      now={now}
      canManage={canManageTicket(viewer, t)}
      onOpen={() => openTicket(t.ticket_no)}
      onMove={(to) => requestMove({ ticket: t, to })}
      dragging={dragging}
    />
  );

  return (
    <>
      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, tone, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            disabled={!onClick}
            className="animate-slide-up rounded-3xl border border-border bg-surface p-4 text-left shadow-sm transition-all enabled:hover:-translate-y-0.5 enabled:hover:shadow-md sm:p-5"
          >
            <div className="flex items-center justify-between">
              <p className="eyebrow">{label}</p>
              <Icon className={cn("size-4", tone)} />
            </div>
            <p className={cn("mt-2 text-3xl font-extrabold", tone)}>{value}</p>
          </button>
        ))}
      </div>

      {mine && (
        <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-3xl bg-surface-inverse px-5 py-3.5 text-text-inverse shadow-sm">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Trophy className="size-4 text-warning-on-inverse" /> Resolved by me
            <span className="text-xl font-extrabold">{mine.resolved}</span>
          </p>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Star className="size-4 fill-star text-warning-on-inverse" /> My average rating
            <span className="text-xl font-extrabold">{mine.avgRating ? mine.avgRating.toFixed(1) : "—"}</span>
            {mine.ratedCount > 0 && <span className="text-xs text-text-inverse-muted">from {mine.ratedCount} rating{mine.ratedCount === 1 ? "" : "s"}</span>}
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={filters.q}
              onChange={(e) => setFilter({ q: e.target.value })}
              placeholder="Search CC-1004 or text…"
              className="h-10 rounded-full bg-surface pl-10"
            />
          </div>
          {/* Mobile: filters in a bottom sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" className="lg:hidden">
                <SlidersHorizontal /> Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl p-5">
              <SheetHeader className="p-0">
                <SheetTitle className="text-lg font-extrabold text-text">Filters</SheetTitle>
                <SheetDescription>Narrow down the tickets list.</SheetDescription>
              </SheetHeader>
              <FilterControls filters={filters} set={setFilter} showModule={showModule} showDepartment={showDepartment} stacked />
              <Button variant="ghost" onClick={() => setFilters({ ...NO_FILTERS, q: filters.q })}>Clear filters</Button>
            </SheetContent>
          </Sheet>
          <div className="ml-auto flex items-center gap-2">
            <LiveBadge live={live} />
            <div className="hidden rounded-full border border-border bg-surface p-1 lg:flex" role="group" aria-label="View">
              {([
                ["board", Kanban, "Board"],
                ["list", List, "List"],
              ] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold",
                    view === v ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2",
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <FilterControls filters={filters} set={setFilter} showModule={showModule} showDepartment={showDepartment} />
          {(activeFilterCount > 0 || filters.q) && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(NO_FILTERS)}>
              <X /> Clear
            </Button>
          )}
        </div>
        {readOnly && (
          <p className="rounded-2xl bg-surface-2 px-4 py-2 text-xs font-semibold text-text-muted">
            Read-only view — departments and the warden manage these tickets.
          </p>
        )}
      </div>

      {showTriage && triage.length > 0 && <TriageLane tickets={triage} canRoute={viewer.role === "warden"} onOpen={openTicket} />}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tickets.length === 0 ? "No open tickets" : "No tickets match these filters"}
          description={tickets.length === 0 ? "New complaints for your team appear here instantly." : "Try clearing a filter or the search."}
          action={tickets.length > 0 ? <Button variant="outline" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button> : undefined}
        />
      ) : (
        <>
          {/* Desktop board */}
          {view === "board" && (
            <div className="hidden lg:block">
              <DndContext
                sensors={sensors}
                onDragStart={(e) => setActiveId(String(e.active.id))}
                onDragEnd={onDragEnd}
                onDragCancel={() => setActiveId(null)}
              >
                <div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
                  {BOARD_COLUMNS.map((col) => {
                    const items = boardTickets.filter((t) => boardColumnOf(t.status) === col).sort(byUrgency);
                    const dropState = !activeTicket
                      ? "idle"
                      : boardColumnOf(activeTicket.status) === col
                        ? "idle"
                        : canTransition(activeTicket.status, col)
                          ? "valid"
                          : "invalid";
                    return (
                      <Column key={col} status={col} count={items.length} dropState={dropState}>
                        {items.map((t) => (
                          <DraggableCard key={t.id} id={t.id} disabled={!canManageTicket(viewer, t)}>
                            {cardFor(t)}
                          </DraggableCard>
                        ))}
                        {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-text-muted">Nothing here</p>}
                      </Column>
                    );
                  })}
                </div>
                <DragOverlay dropAnimation={null}>{activeTicket ? <div className="w-72">{cardFor(activeTicket, true)}</div> : null}</DragOverlay>
              </DndContext>
              <p className="mt-2 text-xs text-text-muted">Tip: drag a card to another column, or use the ••• menu on a card.</p>
            </div>
          )}

          {/* Desktop list */}
          {view === "list" && (
            <div className="hidden lg:block">
              <ListView tickets={filtered} now={now} staffName={staffName} onOpen={openTicket} />
            </div>
          )}

          {/* Mobile: stacked list */}
          <div className="space-y-2.5 lg:hidden">
            {[...boardTickets]
              .sort((a, b) => Number(a.status === "Closed") - Number(b.status === "Closed") || byUrgency(a, b))
              .map((t) => (
              <div key={t.id} className="space-y-1">
                <StatusBadge status={t.status} className="text-[11px]" />
                {cardFor(t)}
              </div>
            ))}
          </div>
        </>
      )}

      <TicketDrawer
        open={!!selected}
        detail={detail && detail.ticket.ticket_no === selected ? detail : null}
        viewer={viewer}
        staff={data.staff}
        canManage={!!detail && canManageTicket(viewer, detail.ticket)}
        onClose={closeTicket}
        onChanged={() => router.refresh()}
        onOpenTicket={openTicket}
        onRequestMove={requestMove}
      />

      {moveDialog}
    </>
  );
}
