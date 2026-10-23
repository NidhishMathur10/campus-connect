import "server-only";
import { z } from "zod";
import { COLLEGE_NAME } from "@/config/college";
import { FEEDBACK_QUESTIONS, type FeedbackKey } from "@/config/feedback";
import { imagePart, generateStructured } from "./gemini";

/** Moderation + summaries for anonymous teacher feedback and concerns (CLAUDE.md §22). */

export type FeedbackKind = "feedback" | "concern";

export interface FeedbackModeration {
  /** allow | rephrase (abusive wording) | block (spam, threats, sexual content) | needs_facts (concern with insults only). */
  level: "allow" | "rephrase" | "block" | "needs_facts";
  /** Friendly reason when blocked. */
  reason: string;
  /** Neutral one-line summary for the HOD with any abusive wording removed. */
  neutral_summary: string | null;
  /** Concern only: describes harassment or sexual misconduct by the teacher. */
  is_misconduct: boolean;
  /** Gemini could not check it (the submission is accepted and flagged "Not moderated"). */
  unchecked: boolean;
}

const ModerationSchema = z.object({
  level: z.enum(["allow", "rephrase", "block"]),
  reason: z.string().describe("One short, polite sentence for the student when level is block; empty otherwise"),
  has_facts: z.boolean().describe("The text states at least one concrete thing that happened (not only insults or opinions)"),
  is_misconduct: z.boolean().describe("Describes sexual misconduct, sexual harassment or physical/verbal sexual advances by the teacher"),
  neutral_summary: z.string().describe("One neutral sentence (max 30 words) in English summarising the text, no insults or abusive wording, no names of students"),
  photo_ok: z.boolean().describe("true if there is no photo or the photo is a normal piece of evidence (document, screenshot, notice, classroom)"),
});

const SHARED_RULES = `Text may be English, Hindi (Devanagari) or Hinglish. Decide the level:
- allow: honest criticism, including blunt or negative opinions about teaching or conduct ("explains too fast", "never answers doubts", "marks unfairly", "is often absent"). Anger and informal slang are fine.
- rephrase: insults, abusive language, slurs, gaalis or personal attacks aimed at a person, in any of those languages. The student will be asked to rewrite it.
- block: spam, gibberish, threats of violence, sexual content, or obvious jokes/fakes.
Never block or downgrade a genuine serious complaint just because it is upsetting or the writer is angry.`;

const SYSTEM = {
  feedback: `You moderate anonymous student feedback about a teacher at ${COLLEGE_NAME}, an Indian college. The student rated the teacher and wrote an optional comment.\n${SHARED_RULES}\nhas_facts and is_misconduct are not important for feedback (set has_facts true, is_misconduct false).`,
  concern: `You moderate a formal, anonymous concern a student filed about a teacher at ${COLLEGE_NAME}, an Indian college.\n${SHARED_RULES}\nA concern that is ONLY insults with no concrete facts must be level "rephrase" and has_facts false. A concern with real facts but also some abusive wording is "rephrase" with has_facts true.\nis_misconduct: true only for sexual harassment, sexual misconduct, inappropriate touching or sexual advances by the teacher.\nIf a photo is attached it should be evidence (document, screenshot, notice, classroom, marks sheet); photo_ok is false for explicit, gory, offensive or unrelated images.`,
} as const;

/**
 * ONE Gemini call per submission. Never throws: if the AI is unavailable the text is allowed and
 * flagged `unchecked` (the HOD sees "Not moderated").
 */
export async function moderateFeedbackText(opts: {
  kind: FeedbackKind;
  text: string;
  context: string;
  photo?: { base64: string; mimeType: string } | null;
}): Promise<FeedbackModeration & { has_facts: boolean; photo_ok: boolean }> {
  const prompt = `${opts.context}\n\nTEXT WRITTEN BY THE STUDENT:\n"""${opts.text}"""`;
  const res = await generateStructured({
    schema: ModerationSchema,
    system: SYSTEM[opts.kind],
    prompt: opts.photo ? [{ text: prompt }, imagePart(opts.photo.base64, opts.photo.mimeType)] : prompt,
    timeoutMs: 15_000,
    temperature: 0,
    // Abusive text has to reach the model to be classified; it is never published.
    relaxedSafety: true,
  });
  if (!res.ok) {
    return { level: "allow", reason: "", neutral_summary: null, is_misconduct: false, unchecked: true, has_facts: true, photo_ok: true };
  }
  const d = res.data;
  let level: FeedbackModeration["level"] = d.level;
  if (opts.kind === "concern" && level !== "block" && !d.has_facts) level = "needs_facts";
  return {
    level,
    reason: d.reason,
    neutral_summary: d.neutral_summary.trim() || null,
    is_misconduct: opts.kind === "concern" && d.is_misconduct,
    unchecked: false,
    has_facts: d.has_facts,
    photo_ok: d.photo_ok,
  };
}

// ---------------------------------------------------------------------------
// Themes summary (HOD + the teacher, only with enough responses)
// ---------------------------------------------------------------------------
export const FeedbackSummarySchema = z.object({
  overview: z.string().describe("Two sentences on how students see the teaching overall"),
  strengths: z.array(z.string()).max(4),
  concerns: z.array(z.string()).max(4),
  suggestions: z.array(z.string()).max(4),
});
export type FeedbackSummary = z.infer<typeof FeedbackSummarySchema>;

export async function summariseFeedback(opts: {
  teacher: string;
  subject: string;
  averages: Record<FeedbackKey, number>;
  comments: string[];
}) {
  const scores = FEEDBACK_QUESTIONS.map((q) => `${q.label}: ${opts.averages[q.key].toFixed(1)}/5`).join(", ");
  return generateStructured({
    schema: FeedbackSummarySchema,
    system: `You summarise anonymous student feedback about a teacher for their Head of Department at ${COLLEGE_NAME}. Comments may be English, Hindi or Hinglish; write in English.
Rules: describe THEMES only. Never quote a comment, never copy distinctive phrases or writing style, never mention a single student, a date, a specific incident that could identify who wrote it, or any abusive wording. Keep each point to one short sentence. Be balanced and fair: say what works, what students find hard, and practical suggestions. If there is little to say for a list, return fewer items.`,
    prompt: `TEACHER: ${opts.teacher}\nSUBJECT: ${opts.subject}\nAVERAGE SCORES: ${scores}\n\nCOMMENTS (${opts.comments.length}):\n${opts.comments.map((c) => `- ${c.slice(0, 500)}`).join("\n") || "(none)"}`,
    timeoutMs: 20_000,
    temperature: 0.3,
    relaxedSafety: true,
  });
}
