import type { FeedbackKey } from "@/config/feedback";
import type { FeedbackSummary } from "@/lib/ai/feedback";

export type Scores = Record<FeedbackKey, number>;

/** One anonymous comment as the HOD / Dean sees it. No student id, no timestamp (timing could identify someone). */
export interface FeedbackComment {
  id: string;
  comment: string;
  neutral_summary: string | null;
  /** The AI could not check this comment ("Not moderated"). */
  unchecked: boolean;
}

export interface TeacherSubjectStats {
  teacherId: string;
  teacherName: string;
  subject: string;
  term: string;
  count: number;
  /** count >= FEEDBACK_MIN_RESPONSES: only then are averages, comments and the AI themes returned. */
  visible: boolean;
  averages: Scores | null;
  overall: number | null;
  /** Verbatim comments: HOD / Dean only. */
  comments: FeedbackComment[];
  /** AI themes (strengths / concerns / suggestions), cached; null while unavailable. */
  summary: FeedbackSummary | null;
}

export interface RateableTeacher {
  teacherId: string;
  teacherName: string;
  subject: string;
  /** This student already rated this teacher for this subject this term. */
  rated: boolean;
}

export type FeedbackResult =
  | { ok: true }
  | { ok: false; error: string; level?: "rephrase" | "block" | "needs_facts" | "photo" };
