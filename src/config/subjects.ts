import { QA_SUBJECTS, type QaSubject } from "./qa";

/** "Ask my teacher" (CLAUDE.md §21): which subjects a student can ask a teacher about. */
export const DOUBT_SUBJECTS: QaSubject[] = QA_SUBJECTS.filter((s) => s !== "Other");

/**
 * Seed mapping: subject -> teacher login ids. The live mapping is `profiles.subjects` on each
 * teacher (warden / HOD edit it on /subjects); `npm run seed` writes these defaults there.
 */
export const DEFAULT_SUBJECT_TEACHERS: Record<string, string[]> = {
  Mathematics: ["das"],
  Programming: ["das"],
  "Introduction to AI": ["das"],
  Physics: ["khan"],
  "Basic Electrical": ["khan"],
  "Environmental Studies": ["khan"],
  "General Studies": ["das", "khan"],
  "Communication Skills": ["das", "khan"],
};

export function defaultSubjectsFor(loginId: string): string[] {
  return DOUBT_SUBJECTS.filter((s) => DEFAULT_SUBJECT_TEACHERS[s]?.includes(loginId));
}

export const DOUBT_STATUSES = ["open", "answered", "closed"] as const;
export type DoubtStatus = (typeof DOUBT_STATUSES)[number];
export const DOUBT_STATUS_LABELS: Record<DoubtStatus, string> = {
  open: "Waiting for teacher",
  answered: "Answered",
  closed: "Closed",
};

export type DoubtPublicStatus = "none" | "requested" | "published" | "declined";

/** An unanswered doubt reminds its teacher(s) after this many hours (once per student message). */
export const DOUBT_REMINDER_HOURS = 48;

/** Roles that can read doubt threads (the HOD read-only). */
export const DOUBT_TEACHER_ROLES = ["teacher"] as const;
export const DOUBT_VIEW_ROLES = ["teacher", "hod"] as const;
/** Roles that edit the subject -> teacher mapping. */
export const SUBJECT_ADMIN_ROLES = ["warden", "hod"] as const;
