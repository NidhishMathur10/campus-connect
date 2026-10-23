import type { Role } from "./roles";

export const QA_SUBJECTS = [
  "General Studies",
  "Mathematics",
  "Programming",
  "Physics",
  "Basic Electrical",
  "Introduction to AI",
  "Communication Skills",
  "Environmental Studies",
  "Other",
] as const;
export type QaSubject = (typeof QA_SUBJECTS)[number];

/** Roles that see authors' ROLL NUMBERS on Q&A (students only see names). */
export const QA_ROLL_VISIBLE_ROLES: Role[] = ["teacher", "academic_office", "hod", "dean"];

/** Roles that can hide posts, clear "pending review" and mark any best answer. */
export const QA_MODERATOR_ROLES: Role[] = ["teacher"];

/** Roles that may answer and comment. */
export const QA_ANSWER_ROLES: Role[] = ["student", "teacher"];

export const QA_FILTERS = ["all", "unanswered", "top", "mine"] as const;
export type QaFilter = (typeof QA_FILTERS)[number];

export const QA_FILTER_LABELS: Record<QaFilter, string> = {
  all: "Newest",
  unanswered: "Unanswered",
  top: "Most upvoted",
  mine: "Mine",
};

/** Soft color per subject badge. */
export const SUBJECT_STYLES: Record<QaSubject, string> = {
  "General Studies": "bg-surface-2 text-text border-border",
  Mathematics: "bg-info-bg text-info-fg border-info-fg/30",
  Programming: "bg-violet-bg text-violet-fg border-violet-fg/30",
  Physics: "bg-info-bg text-info-fg border-info-fg/30",
  "Basic Electrical": "bg-warning-bg text-warning-fg border-warning-fg/30",
  "Introduction to AI": "bg-violet-bg text-violet-fg border-violet-fg/30",
  "Communication Skills": "bg-prio-high-bg text-prio-high-fg border-prio-high-fg/30",
  "Environmental Studies": "bg-success-bg text-success-fg border-success-fg/30",
  Other: "bg-surface-2 text-text-muted border-border",
};

export function isQaSubject(value: unknown): value is QaSubject {
  return typeof value === "string" && (QA_SUBJECTS as readonly string[]).includes(value);
}
