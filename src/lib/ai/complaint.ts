import { z } from "zod";
import { TICKET_SCOPES, type TicketScope } from "@/config/locations";
import {
  categoriesFor,
  DEPARTMENTS,
  PRIORITIES,
  type Category,
  type Department,
  type Priority,
  type TicketModule,
} from "@/config/routing";
import type { ReporterAudience } from "@/config/faculty";
import { PHOTO_LEVELS, TEXT_LEVELS, type ModerationResult } from "@/config/moderation";
import type { PhotoAnalysis } from "@/lib/types";

/**
 * Shared (client + server) shapes for the complaint AI flow.
 * Module-agnostic: the hostel and academic modules differ only in the routing guide
 * and building list passed in.
 */

export interface ComplaintLocation {
  building: string | null;
  floor: string | null;
  /** Hostel room number ("204"). */
  room_no: string | null;
  /** Common area ("Corridor", "Water cooler / RO"...) or free-text spot outside hostels. */
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
    room_no: z.string().max(20).nullable(),
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

/** Moderation shapes shared by the complaint analysis and the Lost & Found analysis (same rules, one call). */
export const TextModerationSchema = z.object({
  level: z.enum(TEXT_LEVELS),
  reason: z.string().describe("One short friendly sentence for the student, in the complaint's language; empty string when level is allow"),
});
export const PhotoModerationSchema = z.object({
  level: z.enum(PHOTO_LEVELS),
  reason: z.string().describe("One short friendly sentence for the student; empty string when level is allow"),
  contains_people: z.boolean().describe("true whenever a person's face or body is clearly visible in the photo, whatever the level"),
});

/** What Gemini must return (converted to a JSON response schema). */
export function buildAnalysisSchema(module: TicketModule, audience: ReporterAudience = "student", hasPhoto = false) {
  const categories = categoriesFor(module, audience) as [string, ...string[]];
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

  const textModeration = TextModerationSchema;
  const photoModeration = PhotoModerationSchema;

  const full = z.object({
    text_moderation: textModeration,
    photo_moderation: photoModeration.optional(),
    language: z
      .string()
      .describe('Language of the complaint: "en" for English, "hi" for Hindi (Devanagari or Hinglish), otherwise its ISO 639-1 code'),
    english_text: z.string().describe("Faithful English translation of the complaint (cleaned-up copy if already English)"),
    title: z.string().describe("English ticket title, at most 8 words"),
    summary: z.string().describe("2-3 sentence English summary for staff, including the location"),
    extracted_issue: z.string().describe("The core problem in a few words, e.g. 'Leaking tap'"),
    scope: z
      .enum(["room", "floor", "building", "unknown"])
      .describe("Hostel only: how many rooms the problem affects according to the student: 'room' (only their room), 'floor' (other rooms on the floor too), 'building', or 'unknown' if not stated"),
    scope_applies: z
      .boolean()
      .describe("Hostel only: true when the problem could affect several rooms (no water / low pressure, a power cut, Wi-Fi outage); false for a single faulty item, a leak inside the room, etc."),
    category: z.enum(categories),
    department: z.enum(DEPARTMENTS),
    priority: z.enum(PRIORITIES),
    is_safety_hazard: z.boolean(),
    disrupts_class: z
      .boolean()
      .describe("Faculty reports only: true if the reporter says a class/lecture/lab is happening now or soon and this problem affects it. Always false otherwise"),
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
      room_no: z.string().describe("Hostel room number (e.g. 204) if mentioned, else empty string"),
      spot: z.string().describe("Hostel: the common area (Corridor, Staircase, Water cooler / RO, Laundry machine, Gym, Mess, Other) if mentioned; elsewhere the exact spot (classroom, lab, court...). Empty string otherwise"),
      machine_id: z.string().describe("Washing machine ID if mentioned, else empty string"),
    }),
    missing_fields: z.array(z.string()).describe("Short names of required details still missing, e.g. 'exact spot'"),
    follow_up_questions: z
      .array(z.string())
      .max(3)
      .describe("Up to 3 friendly questions in the student's language, one per missing detail"),
  });
  // photo_moderation exists only when a photo is attached (and is then required).
  return (hasPhoto
    ? full.extend({ photo_moderation: photoModeration })
    : full.omit({ photo_moderation: true })) as unknown as typeof full;
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
  /** Hostel: how many rooms the issue affects (null when not applicable / not stated). */
  scope: TicketScope | null;
  /** Safety & Security module: the student may be in immediate danger. */
  is_emergency: boolean;
  confidence: { category: number; department: number; priority: number };
  reasons: { category: string; department: string; priority: string };
  photo_analysis: PhotoAnalysis | null;
  /** Form location merged with anything the AI picked up from the text/answers. */
  location: ComplaintLocation;
  missing_fields: string[];
  follow_up_questions: string[];
  /** Text + photo moderation from the same Gemini call. */
  moderation: ModerationResult;
  model: string;
}

export type AnalyzeResponse =
  | {
      ok: true;
      analysis: ComplaintAnalysis;
      /** The photo was rejected (privacy / blocked) and deleted from storage. */
      photoRemoved?: boolean;
    }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------
export const DuplicateRequestSchema = z.object({
  module: z.enum(["hostel", "academic"]),
  category: z.string().min(1),
  building: z.string().nullable(),
  floor: z.string().nullable(),
  room_no: z.string().nullable().default(null),
  spot: z.string().nullable(),
  scope: z.enum(TICKET_SCOPES).nullable().default(null),
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
  room_no: string | null;
  scope: TicketScope | null;
  spot: string | null;
  created_at: string;
  similarity: number;
  reason: string;
  /** True when the student reported the matching ticket themselves. */
  is_own: boolean;
  already_following: boolean;
}

export type DuplicateResponse =
  | { ok: true; match: DuplicateMatch | null; checked: number; method?: "gemini" | "keyword"; model?: string | null }
  | { ok: false; error: string };
