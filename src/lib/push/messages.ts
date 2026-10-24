import { isFaculty } from "@/config/faculty";
import type { Role } from "@/config/roles";

/** Payload the service worker (public/sw.js) turns into a notification. */
export interface PushPayload {
  title: string;
  body: string;
  /** Same tag replaces the earlier notification: we use the ticket number. */
  tag?: string;
  /** App path opened when the notification is tapped. */
  url: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "due in 3h", "due in 2 days", "overdue". */
export function dueIn(dueAt: string | null | undefined, now = Date.now()): string {
  if (!dueAt) return "no deadline";
  const ms = new Date(dueAt).getTime() - now;
  if (ms <= 0) return "overdue";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `due in ${Math.max(mins, 1)} min`;
  const hours = Math.round(ms / 3_600_000);
  if (hours < 48) return `due in ${hours}h`;
  return `due in ${Math.round(hours / 24)} days`;
}

/** Where a staff-side person opens a ticket: My Jobs for field staff, the board for everyone else. */
export function staffTicketPath(role: Role | string, ticketNo: string): string {
  return role === "staff" || role === "security_officer" ? `/jobs/${ticketNo}` : `/staff?t=${ticketNo}`;
}

/** Where a reporter follows a ticket: students /tickets, faculty /reports. */
export function reporterTicketPath(role: Role | string, ticketNo: string): string {
  return `${isFaculty(role as Role) ? "/reports" : "/tickets"}/${ticketNo}`;
}

interface TicketLike {
  ticket_no: string;
  title: string;
  sla_due_at?: string | null;
}

/** "New job: Tap leaking" / "<location> · due in 3h" */
export function jobPayload(
  t: TicketLike,
  role: Role | string,
  location: string,
  kind: "new" | "reopened" | "reminder",
): PushPayload {
  const lead = { new: "New job", reopened: "Reopened job", reminder: "Almost due" }[kind];
  return {
    title: `${lead}: ${clip(t.title, 60)}`,
    body: `${clip(location, 90)} · ${dueIn(t.sla_due_at)}`,
    tag: t.ticket_no,
    url: staffTicketPath(role, t.ticket_no),
  };
}

/** Confidential Safety cases: nothing but "open the app". */
export function confidentialPayload(role: Role | string, ticketNo: string, newCase: boolean): PushPayload {
  return {
    title: newCase ? "New confidential case – open the app" : "Update on a confidential case – open the app",
    body: "Open CampusConnect to view it.",
    tag: ticketNo,
    url: staffTicketPath(role, ticketNo),
  };
}
