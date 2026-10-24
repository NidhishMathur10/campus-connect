import { floorFromRoom, FLOORS, HOSTEL_BUILDINGS, HOSTELS } from "./locations";
import { ACADEMIC_CATEGORIES, HOSTEL_CATEGORIES } from "./routing";
import type { Role } from "./roles";

/** Notice board (CLAUDE.md §23). */
export const NOTICE_MODULES = ["hostel", "academic", "all", "safety"] as const;
export type NoticeModule = (typeof NOTICE_MODULES)[number];

export const NOTICE_MODULE_LABELS: Record<NoticeModule, string> = {
  hostel: "Hostel & Campus",
  academic: "Education",
  all: "Whole campus",
  safety: "Safety alert (campus-wide)",
};

export const NOTICE_TYPES = ["notice", "urgent", "known_issue", "event"] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

export const NOTICE_TYPE_LABELS: Record<NoticeType, string> = {
  notice: "Notice",
  urgent: "Urgent alert",
  known_issue: "Known issue",
  event: "Event",
};

export const NOTICE_STATUSES = ["active", "resolved", "expired"] as const;
export type NoticeStatus = (typeof NOTICE_STATUSES)[number];

/**
 * Who a notice is for. Mirrors `notice_audience_matches()` in schema.sql.
 * `buildings` (hostels), `floors` and `wings` narrow the audience by the student's profile; an empty list
 * means "no restriction". `subjects` and `blocks` are tags: students have no enrolment data, so they
 * label the notice (and, for blocks, let a known issue match a report) without hiding it.
 */
export interface NoticeAudience {
  all?: boolean;
  buildings?: string[];
  floors?: string[];
  wings?: string[];
  subjects?: string[];
  blocks?: string[];
  /** Floors of the blocks (academic known issues). A tag like `blocks`: never narrows by a student profile. */
  block_floors?: string[];
}

export const AUDIENCE_ALL: NoticeAudience = { all: true };

/** Hostel floors a student room can be on (room number first digit; 0 = Ground). */
export const HOSTEL_FLOORS = ["Ground", "1st", "2nd", "3rd", "4th", "5th"] as const;
export const HOSTEL_WINGS = ["Boys Wing", "Girls Wing"] as const;
export const HOSTEL_NAMES: readonly string[] = HOSTEL_BUILDINGS;
export { HOSTELS };

/** Categories a known issue can be about (routing-guide categories, minus the catch-all "Other"). */
export const KNOWN_ISSUE_CATEGORIES = {
  hostel: HOSTEL_CATEGORIES.filter((c) => c !== "Other"),
  academic: ACADEMIC_CATEGORIES.filter((c) => c !== "Other"),
} as const;

// ---------------------------------------------------------------------------
// Who can post what
// ---------------------------------------------------------------------------
export interface PosterRule {
  /** Modules the role may post to (first = default). */
  modules: NoticeModule[];
  types: NoticeType[];
  /** What the audience picker offers. */
  audience: "hostel" | "academic" | "campus" | "all-only";
  /** Teachers may only target subjects they teach. */
  ownSubjectsOnly?: boolean;
}

export const POSTER_RULES: Partial<Record<Role, PosterRule>> = {
  warden: { modules: ["hostel"], types: ["notice", "urgent", "known_issue", "event"], audience: "hostel" },
  hod: { modules: ["academic"], types: ["notice", "urgent", "known_issue", "event"], audience: "academic" },
  academic_office: { modules: ["academic"], types: ["notice", "urgent", "known_issue", "event"], audience: "academic" },
  teacher: { modules: ["academic"], types: ["notice", "urgent", "event"], audience: "academic", ownSubjectsOnly: true },
  dean: { modules: ["all", "hostel", "academic", "safety"], types: ["notice", "urgent", "known_issue", "event"], audience: "campus" },
  security_officer: { modules: ["safety"], types: ["urgent", "notice"], audience: "all-only" },
};

export const NOTICE_POSTER_ROLES = Object.keys(POSTER_RULES) as Role[];

export function posterRule(role: Role | null | undefined): PosterRule | null {
  return (role && POSTER_RULES[role]) || null;
}

/** Modules a student sees on a module page: that module, "all" and campus-wide safety alerts. */
export function modulesForPage(page: "hostel" | "academic"): NoticeModule[] {
  return [page, "all", "safety"];
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------
export const DEFAULT_EXPIRY_DAYS = 7;
/** Events stay up this long after they start. */
export const EVENT_GRACE_HOURS = 6;
/** A resolved known issue stays visible ("Water supply restored") for this long. */
export const RESOLVED_VISIBLE_HOURS = 24;

export function defaultExpiry(type: NoticeType, eventAt: Date | null, now = new Date()): Date {
  if (type === "event" && eventAt) return new Date(eventAt.getTime() + EVENT_GRACE_HOURS * 3_600_000);
  return new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 86_400_000);
}

// ---------------------------------------------------------------------------
// Audience helpers
// ---------------------------------------------------------------------------
const list = (a?: string[]) => (Array.isArray(a) ? a : []);

/** Same rule as `notice_audience_matches()` in schema.sql. */
export function audienceMatchesProfile(
  audience: NoticeAudience | null | undefined,
  p: { hostel: string | null; wing: string | null; room: string | null },
): boolean {
  if (!audience || audience.all) return true;
  const buildings = list(audience.buildings);
  const wings = list(audience.wings);
  const floors = list(audience.floors);
  return (
    (buildings.length === 0 || buildings.includes(p.hostel ?? "")) &&
    (wings.length === 0 || wings.includes(p.wing ?? "")) &&
    (floors.length === 0 || floors.includes(floorFromRoom(p.room) ?? ""))
  );
}

/** "New Hostel · 2nd–5th floor" for badges and the poster view. */
export function describeAudience(audience: NoticeAudience | null | undefined): string {
  if (!audience || audience.all) return "Everyone";
  const parts: string[] = [];
  const buildings = list(audience.buildings);
  const blocks = list(audience.blocks);
  const floors = [...list(audience.floors), ...list(audience.block_floors)];
  const wings = list(audience.wings);
  const subjects = list(audience.subjects);
  if (buildings.length) parts.push(buildings.join(", "));
  if (blocks.length) parts.push(blocks.join(", "));
  if (wings.length) parts.push(wings.join(", "));
  if (floors.length) parts.push(`${floorRange(floors)} floor${floors.length > 1 ? "s" : ""}`);
  if (subjects.length) parts.push(`Subjects: ${subjects.join(", ")}`);
  return parts.join(" · ") || "Everyone";
}

/** ["2nd","3rd","4th","5th"] -> "2nd–5th"; non-consecutive floors are listed. */
function floorRange(floors: string[]): string {
  const order = (f: string) => (FLOORS as readonly string[]).indexOf(f);
  const sorted = [...floors].sort((a, b) => order(a) - order(b));
  const idx = sorted.map(order);
  const consecutive = sorted.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return consecutive ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(", ");
}

/**
 * Does a known issue cover the place a student is reporting from? Audience visibility (the student's own
 * profile) is already enforced by RLS; this checks the building / floor of the complaint itself.
 */
export function knownIssueCoversPlace(
  audience: NoticeAudience | null | undefined,
  place: { building: string | null; floor: string | null },
): boolean {
  if (!audience || audience.all) return true;
  const places = [...list(audience.buildings), ...list(audience.blocks)];
  const floors = [...list(audience.floors), ...list(audience.block_floors)];
  if (places.length > 0 && !(place.building && places.includes(place.building))) return false;
  if (floors.length > 0 && !(place.floor && floors.includes(place.floor))) return false;
  return true;
}
