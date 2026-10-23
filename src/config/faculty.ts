import type { Role } from "./roles";

/** Roles that can report campus issues (Academic module only) and have a "My Reports" page. */
export const FACULTY_ROLES: Role[] = ["teacher", "hod", "academic_office"];

export function isFaculty(role: Role | null | undefined): boolean {
  return !!role && FACULTY_ROLES.includes(role);
}

export type ReporterAudience = "student" | "faculty";

export function audienceOf(role: Role): ReporterAudience {
  return isFaculty(role) ? "faculty" : "student";
}

/** Shown as the AI's priority reason when a faculty report is raised because a class is affected. */
export const CLASS_DISRUPTION_REASON = "Disrupts a scheduled class";

/**
 * Cheap text check for "a class is happening now or soon" (English + Hinglish/Devanagari).
 * The AI decides first; this backs it up (and covers the manual-entry fallback).
 */
const CLASS_WORD = /\b(class|lecture|lab session|practical|tutorial|period|session|exam)\b|क्लास|कक्षा|लेक्चर/i;
const SOON_WORD = /\b(now|today|soon|shortly|right now|in \d+ ?(min|minute|minutes|hour|hours|hr|hrs)|at \d{1,2}(:\d{2})?\s?(am|pm)?|\d{1,2}\s?(am|pm)|after (lunch|recess|break)|next (period|hour)|starting|starts|begins|waiting)\b|अभी|आज|थोड़ी देर/i;

export function mentionsUpcomingClass(text: string): boolean {
  return CLASS_WORD.test(text) && SOON_WORD.test(text);
}
