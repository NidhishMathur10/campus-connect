export const TICKET_STATUSES = [
  "Submitted",
  "Assigned",
  "In Progress",
  "Resolved",
  "Closed",
  "Reopened",
  "Merged",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Columns of the staff Kanban board. Reopened tickets show in "Submitted";
 * "Closed" only shows tickets closed in the last CLOSED_ON_BOARD_DAYS days.
 */
export const BOARD_COLUMNS: TicketStatus[] = ["Submitted", "Assigned", "In Progress", "Resolved", "Closed"];
export const CLOSED_ON_BOARD_DAYS = 7;

/** Finished tickets (student "Completed" tab). */
export const DONE_STATUSES: TicketStatus[] = ["Closed", "Merged"];

/** Statuses that count as "open" (still needs work). */
export const OPEN_STATUSES: TicketStatus[] = ["Submitted", "Assigned", "In Progress", "Reopened"];

export const DUPLICATE_STATUSES = ["none", "flagged", "merged", "dismissed"] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export const EVENT_TYPES = [
  "created",
  "status_change",
  "assigned",
  "note",
  "duplicate_flagged",
  "merged",
  "duplicate_dismissed",
  "override",
  "escalated",
  "reopened",
  "rating",
  "me_too",
] as const;
export type TicketEventType = (typeof EVENT_TYPES)[number];

/** Event types hidden from students (enforced by RLS as well). */
export const INTERNAL_EVENT_TYPES: TicketEventType[] = [
  "override",
  "duplicate_flagged",
  "duplicate_dismissed",
];

/** Duplicate threshold for auto-flagging (CLAUDE.md §6.4). */
export const DUPLICATE_FLAG_THRESHOLD = 0.7;

/** Escalation thresholds (CLAUDE.md §7). */
export const ESCALATION_RULES = {
  recurringMinTickets: 3,
  recurringWindowDays: 30,
  reopenCount: 2,
  duplicateWindowDays: 7,
  /** Priorities whose missed SLA escalates. */
  slaPriorities: ["Urgent", "High"],
} as const;

export const ESCALATION_REASON_LABELS: Record<"recurring" | "reopened" | "sla_breach" | "manual", string> = {
  recurring: "Recurring",
  reopened: "Reopened twice",
  sla_breach: "SLA breached",
  manual: "Manual",
};

/**
 * Status changes staff may make (CLAUDE.md §5). Resolved → Closed / Reopened is the
 * student's step; Merged only happens through "Merge".
 */
export const STAFF_TRANSITIONS: Partial<Record<TicketStatus, TicketStatus[]>> = {
  Submitted: ["Assigned", "In Progress"],
  Reopened: ["Assigned", "In Progress"],
  Assigned: ["In Progress"],
  "In Progress": ["Resolved", "Assigned"],
  Resolved: ["In Progress"],
};

/** Moving into these statuses needs a note for the student. */
export const NOTE_REQUIRED_STATUSES: TicketStatus[] = ["In Progress", "Resolved"];

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return STAFF_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Which Kanban column a ticket sits in (Reopened shows under Submitted). */
export function boardColumnOf(status: TicketStatus): TicketStatus | null {
  if (status === "Reopened") return "Submitted";
  return BOARD_COLUMNS.includes(status) ? status : null;
}
