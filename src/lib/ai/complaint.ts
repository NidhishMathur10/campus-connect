import { z } from "zod";
import {
  categoriesFor,
  DEPARTMENTS,
  PRIORITIES,
  type Category,
  type Department,
  type Priority,
  type TicketModule,
} from "@/config/routing";
import type { PhotoAnalysis } from "@/lib/types";

/**
 * Shared (client + server) shapes for the complaint AI flow.
 * Module-agnostic: the hostel and academic modules differ only in the routing guide
 * and building list passed in.
 */

export interface ComplaintLocation {
  building: string | null;
  floor: string | null;
  spot: string | null;
  machine_id: string | null;
}

export interface FollowUpAnswer {
  questions: string[];
  answer: string;
}

/** Request body for POST /api/ai/analyze. */
export const AnalyzeRequestSchema = z.object({
  module: z.enum(["hostel", "academic", "security"]),
  text: z.string().trim().min(3, "Please describe the problem").max(2000),
  location: z.object({
    building: z.string().nullable(),
    floor: z.string().nullable(),
    spot: z.string().max(120).nullable(),
    machine_id: z.string().nullable(),
  }),
  /** Storage path inside the complaint-photos bucket (`<userId>/<file>.jpg`). */
  photoPath: z.string().max(300).nullable().optional(),
  /** Set on the second (final) round. */
  followUp: z
    .object({ questions: z.array(z.string()).max(3), answer: z.string().trim().max(1000) })
    .nullable()
    .optional(),
  /** Photo analysis from round 1, so round 2 doesn't need to resend the image. */
  previousPhotoAnalysis: z
    .object({ observed: z.string(), matches_complaint: z.boolean(), notes: z.string() })
    .nullable()
    .optional(),
});
export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>;

/** What Gemini must return (converted to a JSON response schema). */
export function buildAnalysisSchema(module: TicketModule) {
  const categories = categoriesFor(module) as [string, ...string[]];
  const fieldScore = z.object({
    category: z.number().min(0).max(1),
    department: z.number().min(0).max(1),
    priority: z.number().min(0).max(1),
  });
  const fieldReason = z.object({
    category: z.string(),
    department: z.string(),
    priority: z.string(),
  });

  return z.object({
    language: z
      .string()
      .describe('Language of the complaint: "en" for English, "hi" for Hindi (Devanagari or Hinglish), otherwise its ISO 639-1 code'),
    english_text: z.string().describe("Faithful English translation of the complaint (cleaned-up copy if already English)"),
    title: z.string().describe("English ticket title, at most 8 words"),
    summary: z.string().describe("2-3 sentence English summary for staff, including the location"),
    extracted_issue: z.string().describe("The core problem in a few words, e.g. 'Leaking tap'"),
    category: z.enum(categories),
    department: z.enum(DEPARTMENTS),
    priority: z.enum(PRIORITIES),
    is_safety_hazard: z.boolean(),
    is_emergency: z
      .boolean()
      .describe("true ONLY if the student seems to be in immediate danger right now (being attacked, followed, trapped, threatened at this moment)"),
    confidence: fieldScore,
    reasons: fieldReason,
    photo_analysis: z.object({
      observed: z.string().describe("What the photo shows; empty string if no photo"),
      matches_complaint: z.boolean().describe("Does the photo match the complaint? true if no photo"),
      notes: z.string().describe("Useful notes for staff (visible damage, hazards); empty if no photo"),
    }),
    extracted_location: z.object({
      building: z.string().describe("Exact building name from the list if mentioned, else empty string"),
      floor: z.string().describe("Exact floor name from the list if mentioned, else empty string"),
      spot: z.string().describe("Exact spot (room no., washroom, corridor...) if mentioned, else empty string"),
      machine_id: z.string().describe("Washing machine ID if mentioned, else empty string"),
    }),
    missing_fields: z.array(z.string()).describe("Short names of required details still missing, e.g. 'exact spot'"),
    follow_up_questions: z
      .array(z.string())
      .max(3)
      .describe("Up to 3 friendly questions in the student's language, one per missing detail"),
  });
}
export type RawAnalysis = z.infer<ReturnType<typeof buildAnalysisSchema>>;

/** Normalised analysis returned to the browser. */
export interface ComplaintAnalysis {
  language: string;
  english_text: string;
  title: string;
  summary: string;
  extracted_issue: string;
  category: Category;
  department: Department;
  priority: Priority;
  is_safety_hazard: boolean;
  /** Safety & Security module: the student may be in immediate danger. */
  is_emergency: boolean;
  confidence: { category: number; department: number; priority: number };
  reasons: { category: string; department: string; priority: string };
  photo_analysis: PhotoAnalysis | null;
  /** Form location merged with anything the AI picked up from the text/answers. */
  location: ComplaintLocation;
  missing_fields: string[];
  follow_up_questions: string[];
  model: string;
}

export type AnalyzeResponse =
  | { ok: true; analysis: ComplaintAnalysis }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------
export const DuplicateRequestSchema = z.object({
  module: z.enum(["hostel", "academic"]),
  category: z.string().min(1),
  building: z.string().nullable(),
  floor: z.string().nullable(),
  spot: z.string().nullable(),
  title: z.string(),
  summary: z.string(),
  english_text: z.string(),
});
export type DuplicateRequest = z.infer<typeof DuplicateRequestSchema>;

export interface DuplicateMatch {
  id: string;
  ticket_no: string;
  title: string;
  summary: string | null;
  status: string;
  photo_url: string | null;
  building: string | null;
  floor: string | null;
  spot: string | null;
  created_at: string;
  similarity: number;
  reason: string;
  /** True when the student reported the matching ticket themselves. */
  is_own: boolean;
  already_following: boolean;
}

export type DuplicateResponse =
  | { ok: true; match: DuplicateMatch | null; checked: number }
  | { ok: false; error: string };
