import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { inBackground } from "./send";
import { deliverAlert } from "./lost-found-notify";
import { PERSON_COLUMNS, peopleByIds, clip, type Person } from "./notify";

/**
 * Notifications for formal concerns about a teacher (CLAUDE.md §22): in-app bell + email (+ WhatsApp flag)
 * through the same helpers as everything else. Only the student and the HOD / Dean are ever told, and
 * messages carry no names and no complaint text. The teacher is never notified. Fire-and-forget.
 */
const hodPath = (no: string) => `/concerns/${no}`;

async function roleHolders(role: "hod" | "dean"): Promise<Person[]> {
  const { data } = await createAdminClient().from("profiles").select(PERSON_COLUMNS).eq("role", role);
  return (data ?? []) as Person[];
}

/**
 * To the student: received (so they know the number) or an update.
 * `inApp: false` when a status_change / escalated ticket event already created the bell row (database trigger).
 */
export function notifyConcernStudent(studentId: string, ticketNo: string, title: string, message: string, opts: { inApp?: boolean } = {}): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "ticket",
      recipients: await peopleByIds([studentId]),
      template: "concern_student",
      title,
      message: clip(message, 400),
      rows: [["Concern", ticketNo]],
      buttonLabel: "View progress",
      path: `/tickets/${ticketNo}`,
      inApp: opts.inApp,
    });
  });
}

/** To the HOD: a new concern. Dean: only when it was escalated. */
export function notifyConcernFiled(ticketNo: string, category: string): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "ticket",
      recipients: await roleHolders("hod"),
      template: "concern_filed",
      title: "A confidential concern needs your attention",
      message: `An anonymous student concern (${category}) was filed as ${ticketNo}. Please acknowledge it within 72 hours, or it goes to the Dean.`,
      rows: [["Concern", ticketNo], ["Type", category]],
      buttonLabel: "Open the concern",
      path: hodPath(ticketNo),
    });
  });
}

export function notifyConcernEscalated(ticketNo: string, category: string, why: string): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "ticket",
      recipients: await roleHolders("dean"),
      template: "concern_escalated",
      title: "A concern was escalated to you",
      message: `An anonymous student concern (${category}, ${ticketNo}) was escalated: ${why}.`,
      rows: [["Concern", ticketNo], ["Type", category]],
      buttonLabel: "Open the concern",
      path: hodPath(ticketNo),
    });
  });
}
