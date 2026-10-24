import { BUILDINGS } from "@/config/locations";
import type { Role } from "@/config/roles";

/** Lost & Found (CLAUDE.md §20). Single source of truth for categories, statuses and rules. */

export const LF_TYPES = ["lost", "found"] as const;
export type LfType = (typeof LF_TYPES)[number];

export const LF_STATUSES = ["open", "matched", "claimed", "returned", "expired"] as const;
export type LfStatus = (typeof LF_STATUSES)[number];

export const LF_STATUS_LABELS: Record<LfStatus, string> = {
  open: "Open",
  matched: "Possible match",
  claimed: "Claim approved",
  returned: "Returned",
  expired: "Closed",
};

export const LF_HELD_AT = ["security_office", "with_finder"] as const;
export type LfHeldAt = (typeof LF_HELD_AT)[number];
export const LF_HELD_LABELS: Record<LfHeldAt, string> = {
  security_office: "At the Security Office",
  with_finder: "With the finder",
};

export const LF_DISPOSITIONS = ["disposed", "donated"] as const;
export type LfDisposition = (typeof LF_DISPOSITIONS)[number];

export const LF_CATEGORIES = [
  "Phone",
  "Wallet",
  "ID card",
  "Keys",
  "Bottle",
  "Earphones",
  "Bag",
  "Umbrella",
  "Book",
  "Laptop / charger",
  "Clothing",
  "Other",
] as const;
export type LfCategory = (typeof LF_CATEGORIES)[number];

/** Always treated as valuables (blurred photo, no brand / marks in public) whatever the AI says. */
export const LF_SENSITIVE_CATEGORIES: readonly LfCategory[] = ["Phone", "Wallet", "ID card", "Laptop / charger"];

export function isLfCategory(value: string | null | undefined): value is LfCategory {
  return !!value && (LF_CATEGORIES as readonly string[]).includes(value);
}

/** A new item is compared with open items of the opposite type from this many days back. */
export const LF_MATCH_WINDOW_DAYS = 14;
/** Matches at or above this score are saved as suggestions and both people are told. */
export const LF_MATCH_THRESHOLD = 0.7;
/** Found items nobody claimed after this many days go on the Security Officer's expiry list. */
export const LF_EXPIRY_DAYS = 30;
/** The expiry list also warns this many days before. */
export const LF_EXPIRY_WARN_DAYS = 5;

export const LF_PLACES = [...BUILDINGS, "Elsewhere on campus"] as const;

/** Who can post lost / found items. */
export const LF_REPORTER_ROLES: Role[] = ["student", "teacher", "hod", "academic_office"];
/** Who manages the desk (approve claims, confirm matches, hand over, dispose). */
export const LF_MANAGER_ROLES: Role[] = ["security_officer"];
/** Who sees everything, including private details, roll numbers and the audit log. */
export const LF_STAFF_ROLES: Role[] = ["security_officer", "warden", "dean"];
/** Who may open the desk (claims, held items, approvals). The dean sees it read-only. */
export const LF_DESK_ROLES: Role[] = ["security_officer", "dean"];
/** Everyone who may open the Lost & Found pages. */
export const LF_ALL_ROLES: Role[] = [...LF_REPORTER_ROLES, ...LF_STAFF_ROLES];

export const isLfManager = (role: Role) => LF_MANAGER_ROLES.includes(role);
export const canOpenLfDesk = (role: Role) => LF_DESK_ROLES.includes(role);
export const isLfStaff = (role: Role) => LF_STAFF_ROLES.includes(role);

/** Default pickup instruction once a claim is approved. */
export const LF_DEFAULT_PICKUP = "Collect it from the Security Office. Bring your college ID card.";
