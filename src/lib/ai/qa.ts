import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { COLLEGE_NAME } from "@/config/college";
import { QA_SUBJECTS, type QaSubject } from "@/config/qa";
import { generateStructured, type AiResult } from "./gemini";

/** CLAUDE.md §6.5–6.6 + Phase 5B: Q&A moderation, similar questions, teacher drafts. */

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------
export type PostKind = "question" | "answer" | "comment";

export const ModerateRequestSchema = z.object({
  kind: z.enum(["question", "answer", "comment"]),
  title: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(5000),
  /** Question title, for answers/comments (helps judge "off-topic"). */
  context: z.string().trim().max(300).optional(),
});
export type ModerateRequest = z.infer<typeof ModerateRequestSchema>;

export interface ModerationResult {
  allowed: boolean;
  /** Polite, student-facing reason when blocked. */
  reason: string;
  /** True when Gemini was unavailable: the post is allowed but teachers should check it. */
  pending_review: boolean;
}

const ModerationSchema = z.object({
  allowed: z.boolean(),
  category: z.enum(["ok", "abusive", "spam", "gibberish", "off_topic"]),
  reason: z.string().describe("One short, polite sentence to the student explaining why it was blocked; empty if allowed"),
});

const MODERATION_SYSTEM = `You moderate the open academic Q&A board of ${COLLEGE_NAME}, an Indian college. Students ask study doubts; students and teachers answer and comment. Posts may be in English, Hindi (Devanagari) or Hinglish — all are fine.

Block a post (allowed = false) ONLY if it is clearly:
- abusive: insults, slurs, harassment, threats, sexual content, hate, or profanity aimed at people (in any language, including Hindi/Hinglish gaalis)
- spam: ads, promotions, referral links, repeated characters/words, "buy followers", unrelated links
- gibberish: random keystrokes or text with no meaning (e.g. "asdf qwer zzzz")
- off_topic: clearly unrelated to studies or college academics (e.g. selling a phone, dating, cricket scores, political rants)

Allow everything else, even if short, informal, badly spelled or a very basic question. Questions about college admin (exams, assignments, attendance, timetable, resources) are on-topic. Short comments like "thanks, that helped" or "same doubt" are fine.
The reason must be kind and tell them how to fix it, e.g. "Please keep the language respectful — rephrase your question without insults."`;

/** Moderation results the server has already computed (so the post action needn't call Gemini again). */
const cache = new Map<string, { result: ModerationResult; at: number }>();
const CACHE_MS = 15 * 60_000;

function cacheKey(userId: string, req: ModerateRequest): string {
  return createHash("sha256")
    .update([userId, req.kind, req.title ?? "", req.text].join("\u0000"))
    .digest("hex");
}

/**
 * Never throws. If Gemini is unavailable the post is allowed with pending_review = true.
 * Results are cached per user + exact text for 15 minutes.
 */
export async function moderatePost(userId: string, req: ModerateRequest): Promise<ModerationResult> {
  const key = cacheKey(userId, req);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  const parts = [
    `POST TYPE: ${req.kind}`,
    req.context ? `QUESTION IT REPLIES TO: ${req.context}` : null,
    req.title ? `TITLE: ${req.title}` : null,
    `TEXT:\n"""${req.text}"""`,
  ].filter(Boolean);

  const res = await generateStructured({
    schema: ModerationSchema,
    system: MODERATION_SYSTEM,
    prompt: parts.join("\n\n"),
    timeoutMs: 12_000,
    temperature: 0,
    // Abusive text must reach the model to be classified (it never gets published).
    relaxedSafety: true,
  });

  const result: ModerationResult = res.ok
    ? {
        allowed: res.data.allowed || res.data.category === "ok",
        reason: res.data.allowed || res.data.category === "ok" ? "" : res.data.reason || "This post doesn't fit the Q&A board guidelines.",
        pending_review: false,
      }
    : { allowed: true, reason: "", pending_review: true };

  if (res.ok) {
    if (cache.size > 500) cache.clear();
    cache.set(key, { result, at: Date.now() });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Similar questions + suggested subject
// ---------------------------------------------------------------------------
export interface QuestionCandidate {
  id: string;
  title: string;
  subject: string;
}

export interface SimilarResult {
  similar: { id: string; score: number }[];
  suggested_subject: QaSubject | null;
  model: string;
}

const SimilarSchema = z.object({
  suggested_subject: z.enum(QA_SUBJECTS),
  matches: z.array(
    z.object({
      id: z.string(),
      score: z.number().min(0).max(1).describe("How likely it asks the same thing (1 = same question)"),
    }),
  ),
});

const STOP = new Set(
  "a an the is are was were to of in on for and or what why how which when who do does did can i my me we you it this that with from by be at as about any some vs".split(" "),
);
const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );

/** Word-overlap fallback when Gemini is unavailable. */
export function lexicalSimilar(text: string, candidates: QuestionCandidate[], limit = 3): { id: string; score: number }[] {
  const q = tokens(text);
  if (q.size === 0) return [];
  return candidates
    .map((c) => {
      const t = tokens(c.title);
      const overlap = [...q].filter((w) => t.has(w)).length;
      return { id: c.id, score: overlap / Math.max(3, Math.min(q.size, t.size) + 1) };
    })
    .filter((r) => r.score >= 0.34)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

const similarCache = new Map<string, { result: SimilarResult; at: number }>();

export async function similarQuestions(
  input: { title: string; body?: string },
  candidates: QuestionCandidate[],
): Promise<SimilarResult> {
  const key = `${input.title.trim().toLowerCase()}|${candidates.length}`;
  const hit = similarCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.result;

  const list = candidates.map((c) => `- ${c.id} | ${c.subject} | ${c.title}`).join("\n");
  const res = await generateStructured({
    schema: SimilarSchema,
    system: `You help students on a college Q&A board avoid duplicate questions. Subjects: ${QA_SUBJECTS.join(", ")}.
1. suggested_subject: the best subject for the new question ("Other" if none fits).
2. matches: up to 3 existing questions (by id) that ask the SAME or a very closely related thing, best first, with a score. Only include genuinely related ones (score ≥ 0.5). Questions may be in English, Hindi or Hinglish. Empty list if none.`,
    prompt: `NEW QUESTION\nTitle: ${input.title}${input.body ? `\nDetails: ${input.body.slice(0, 600)}` : ""}\n\nEXISTING QUESTIONS (id | subject | title):\n${list || "(none)"}`,
    timeoutMs: 10_000,
    temperature: 0,
  });

  const ids = new Set(candidates.map((c) => c.id));
  const result: SimilarResult = res.ok
    ? {
        suggested_subject: res.data.suggested_subject,
        similar: res.data.matches.filter((m) => ids.has(m.id.trim()) && m.score >= 0.5).slice(0, 3),
        model: res.model,
      }
    : { suggested_subject: null, similar: lexicalSimilar(input.title, candidates), model: "keywords" };

  if (res.ok) {
    if (similarCache.size > 300) similarCache.clear();
    similarCache.set(key, { result, at: Date.now() });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Teacher: "Draft with AI"
// ---------------------------------------------------------------------------
const DraftSchema = z.object({
  answer: z.string().describe("The draft answer, plain text with short paragraphs or numbered steps"),
});

export async function draftAnswer(q: {
  subject: string;
  title: string;
  body: string;
  existingAnswers: string[];
}): Promise<AiResult<{ answer: string }>> {
  return generateStructured({
    schema: DraftSchema,
    system: `You draft answers for a teacher at ${COLLEGE_NAME} replying to a first-year student's doubt on the college Q&A board.
Write as the teacher, in a clear, friendly, encouraging tone. Be correct and concise (60–180 words). Explain the idea, then give a short example or the key steps.
Reply in the language of the question (English, Hindi in Devanagari, or Hinglish).
Do not mention AI, do not sign the answer, do not add a greeting line like "Dear student". If the question is about college rules (deadlines, attendance, assignments) and you can't know the answer, say what the student should check and with whom, without inventing facts.`,
    prompt: `SUBJECT: ${q.subject}\nQUESTION: ${q.title}\nDETAILS: ${q.body}${
      q.existingAnswers.length ? `\n\nANSWERS ALREADY POSTED (don't repeat them; add what's missing):\n${q.existingAnswers.map((a) => `- ${a.slice(0, 400)}`).join("\n")}` : ""
    }`,
    timeoutMs: 20_000,
    temperature: 0.4,
  });
}
