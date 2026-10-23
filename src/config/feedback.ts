/** Anonymous teacher feedback + formal concerns (CLAUDE.md §22). */

export const FEEDBACK_QUESTIONS = [
  { key: "clarity", label: "Clarity of teaching", hint: "Explains ideas so they are easy to follow" },
  { key: "doubt_solving", label: "Doubt solving", hint: "Answers questions patiently and well" },
  { key: "punctuality", label: "Punctuality", hint: "Starts and ends classes on time, takes classes regularly" },
  { key: "fairness", label: "Fairness", hint: "Treats everyone equally, marks fairly" },
  { key: "respect", label: "Respect", hint: "Respectful and approachable towards students" },
] as const;
export type FeedbackKey = (typeof FEEDBACK_QUESTIONS)[number]["key"];

/** Averages, comments and AI themes are shown only when a teacher/subject/term has at least this many responses (k-anonymity). */
export const FEEDBACK_MIN_RESPONSES = 5;

export const FEEDBACK_ANON_NOTE = "Your feedback is anonymous — teachers, HOD and Dean never see your name.";
export const CONCERN_ANON_NOTE = "Your report is anonymous.";
export const ANONYMOUS_STUDENT = "Anonymous student";

/**
 * The current term, e.g. "2026-Odd" (July–December) or "2026-Even" (January–June).
 * FEEDBACK_TERM overrides it (server env), handy for demos.
 */
export function currentTerm(now: Date = new Date()): string {
  const override = process.env.FEEDBACK_TERM?.trim();
  if (override) return override;
  return `${now.getFullYear()}-${now.getMonth() >= 6 ? "Odd" : "Even"}`;
}

// ---------------------------------------------------------------------------
// Formal concerns
// ---------------------------------------------------------------------------
export const CONCERN_CATEGORIES = [
  "Unfair marking",
  "Absence / irregular classes",
  "Disrespectful behaviour",
  "Discrimination",
  "Harassment or sexual misconduct",
  "Other",
] as const;
export type ConcernCategory = (typeof CONCERN_CATEGORIES)[number];

/** Routed to the existing confidential Safety module (Anti-Ragging Committee + Dean) instead of the HOD. */
export const SAFETY_CONCERN_CATEGORY: ConcernCategory = "Harassment or sexual misconduct";
/** Goes to the Dean immediately. */
export const IMMEDIATE_DEAN_CATEGORIES: ConcernCategory[] = ["Discrimination"];

/** The ticket these concerns create: confidential, academic, held by the HOD. */
export const CONCERN_TICKET_CATEGORY = "Teacher Concern";
export const CONCERN_DEPARTMENT = "Head of Department";
/** Not acknowledged by the HOD within this many hours -> escalated to the Dean. */
export const CONCERN_ACK_HOURS = 72;
/** At most this many concerns per student per term about the same teacher. */
export const CONCERN_MAX_PER_TEACHER_TERM = 3;

/** Shown to the student on the ticket instead of any staff name. */
export const CONCERN_ACTOR_NAMES = { hod: "Head of Department", dean: "Dean's office" } as const;

export const MODERATION_MESSAGES_FEEDBACK = {
  rephrase: "Please rephrase without abusive language — your feedback still matters.",
  concernRephrase: "Please rephrase without abusive language — your concern still matters.",
  needsFacts: "Please describe what happened, when, and in which class.",
  block: "We couldn't accept this.",
} as const;
