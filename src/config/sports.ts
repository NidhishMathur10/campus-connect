import type { Role } from "./roles";

/** Sports equipment issuing (Hostel module). Single source of truth for hours, limits and categories. */

/** Campus time zone: slot hours are interpreted here, whatever the server's zone is. */
export const SPORTS_TZ = "Asia/Kolkata";
/** India has no daylight saving, so a fixed offset is exact. */
export const SPORTS_UTC_OFFSET = "+05:30";

/** Opening hours of the Sports Complex equipment counter (24h clock, `close` is the last return time). */
export const SPORTS_OPEN_HOUR = 6;
export const SPORTS_CLOSE_HOUR = 21;

/** Slot lengths a student can pick, in hours. */
export const SPORTS_SLOT_HOURS = [1, 2] as const;

/** Most items (sum of quantities) one student can hold at once: reserved + issued + overdue. */
export const SPORTS_MAX_ITEMS_PER_STUDENT = 2;

/** A reservation not picked up within this long after its slot starts expires by itself. */
export const SPORTS_PICKUP_GRACE_MIN = 30;

/** Bell + push reminder this long before the return time. */
export const SPORTS_REMINDER_MIN = 30;

/** 2+ late returns in the last 30 days block new reservations for 3 days. */
export const SPORTS_OVERDUE_LIMIT = 2;
export const SPORTS_OVERDUE_WINDOW_DAYS = 30;
export const SPORTS_BLOCK_DAYS = 3;

export const SPORTS_CATEGORIES = ["Football", "Basketball", "Volleyball", "Badminton", "Cricket", "Table Tennis", "Indoor games", "Other"] as const;
export type SportsCategory = (typeof SPORTS_CATEGORIES)[number];

export const LOAN_STATUSES = ["reserved", "issued", "returned", "expired", "overdue", "return_pending"] as const;
export type LoanStatus = (typeof LOAN_STATUSES)[number];
export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  reserved: "Reserved",
  issued: "Issued",
  returned: "Returned",
  expired: "Expired",
  overdue: "Overdue",
  return_pending: "Return pending",
};
/** Statuses where the student still holds (or has claimed) the item: they count against availability and the per-student limit. */
export const LOAN_ACTIVE_STATUSES: LoanStatus[] = ["reserved", "issued", "overdue", "return_pending"];

/** Who runs the desk (writes) and who may look (read-only). */
export const SPORTS_MANAGER_ROLES: Role[] = ["sports_incharge"];
export const SPORTS_VIEWER_ROLES: Role[] = ["sports_incharge", "warden", "dean"];

export const isSportsManager = (role: Role) => SPORTS_MANAGER_ROLES.includes(role);

/** Pickup codes avoid look-alike characters (0/O, 1/I). */
export const PICKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const PICKUP_CODE_LENGTH = 6;
