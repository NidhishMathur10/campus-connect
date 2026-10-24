import type { Priority, TicketModule } from "@/config/routing";
import type { TicketStatus } from "@/config/statuses";

/** What the "My Jobs" screens need about a ticket (already redacted for confidential cases). */
export interface JobTicket {
  id: string;
  ticket_no: string;
  status: TicketStatus;
  priority: Priority;
  category: string;
  module: TicketModule;
  /** Null for confidential cases (the UI shows "Confidential case"). */
  title: string | null;
  title_hi: string | null;
  building: string | null;
  floor: string | null;
  room_no: string | null;
  spot: string | null;
  machine_id: string | null;
  photo_url: string | null;
  sla_due_at: string | null;
  sla_paused_at: string | null;
  waiting_reason: string | null;
  confidential: boolean;
  reopen_count: number;
  /** Reporter + "Me too" followers. */
  affected: number;
  resolved_at: string | null;
}

export interface JobsData {
  /** Assigned / In Progress / Reopened (waiting tickets are In Progress with sla_paused_at set). */
  active: JobTicket[];
  /** Resolved or closed today (IST) by this person. */
  doneToday: JobTicket[];
  /** Server time, so the first render matches the browser's. */
  serverNow: number;
}

export type HelpKind = "parts" | "person" | "access" | "not_mine";

/** Quick-pick notes the student sees when a job is marked done. */
export const DONE_NOTES = ["Replaced part", "Repaired", "Cleaned", "Reset/restarted"] as const;
