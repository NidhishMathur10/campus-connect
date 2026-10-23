import { DEPARTMENTS, SECURITY_DEPARTMENTS, TRIAGE_DEPARTMENT, type Department } from "./routing";

/** Roles that work tickets and so can be auto-assigned. */
export const AUTO_ASSIGN_ROLES = ["staff", "academic_office"] as const;

/** Share of the SLA window after which the assignee gets one reminder. */
export const SLA_REMINDER_FRACTION = 0.75;

/** The watcher runs at most this often per server instance. */
export const SLA_WATCHER_THROTTLE_MS = 60_000;

/** Departments that can have auto-assignment switched on/off (the triage lane and security teams never auto-assign). */
export const AUTO_ASSIGN_DEPARTMENTS: Department[] = DEPARTMENTS.filter(
  (d) => d !== TRIAGE_DEPARTMENT && !SECURITY_DEPARTMENTS.includes(d),
);

/** Shows the "Simulate deadline passed" button for the warden / dean. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || process.env.NODE_ENV === "development";

// app_settings keys
export const SETTING_AUTO_ASSIGN_DISABLED = "auto_assign_disabled";
export const SETTING_REASSIGN_MANUAL = "reassign_manual";
