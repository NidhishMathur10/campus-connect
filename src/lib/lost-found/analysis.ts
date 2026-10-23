import { z } from "zod";
import { LF_TYPES, type LfCategory } from "@/config/lost-found";
import type { ModerationResult } from "@/config/moderation";
import type { PhotoAnalysis } from "@/lib/types";

/** Client + server shapes for the Lost & Found AI step (POST /api/lost-found/analyze). */

export const LfAnalyzeRequestSchema = z.object({
  type: z.enum(LF_TYPES),
  text: z.string().trim().min(3, "Please describe the item").max(1500),
  building: z.string().max(80).nullable(),
  spot: z.string().max(120).nullable(),
  /** Storage path inside the complaint-photos bucket (`<userId>/<file>.jpg`). */
  photoPath: z.string().max(300).nullable().optional(),
});
export type LfAnalyzeRequest = z.infer<typeof LfAnalyzeRequestSchema>;

export interface LfAnalysis {
  language: string;
  title: string;
  /** Safe for everyone: no names, ID numbers or contents. */
  public_description: string;
  /** Faithful English version of what the reporter wrote. */
  english_description: string;
  item_category: LfCategory;
  color: string;
  brand: string;
  marks: string;
  sensitive: boolean;
  location: { building: string | null; spot: string | null };
  /** Found items: a question only the owner could answer (never reveals the answer). */
  verification_question: string;
  photo_analysis: PhotoAnalysis | null;
  moderation: ModerationResult;
  model: string;
}

export type LfAnalyzeResponse =
  | { ok: true; analysis: LfAnalysis; photoRemoved?: boolean }
  | { ok: false; error: string };
