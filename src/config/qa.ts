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
  "General Studies": "bg-slate-50 text-slate-700 border-border",
  Mathematics: "bg-blue-50 text-blue-700 border-blue-200",
  Programming: "bg-violet-50 text-violet-700 border-violet-200",
  Physics: "bg-cyan-50 text-cyan-700 border-cyan-200",
  "Basic Electrical": "bg-yellow-50 text-yellow-700 border-yellow-200",
  "Introduction to AI": "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "Communication Skills": "bg-orange-50 text-orange-700 border-orange-200",
  "Environmental Studies": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Other: "bg-slate-50 text-slate-600 border-border",
};

export function isQaSubject(value: unknown): value is QaSubject {
  return typeof value === "string" && (QA_SUBJECTS as readonly string[]).includes(value);
}
