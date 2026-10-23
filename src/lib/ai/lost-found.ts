import "server-only";
import type { Part } from "@google/genai";
import { z } from "zod";
import { COLLEGE_NAME } from "@/config/college";
import {
  isLfCategory,
  LF_CATEGORIES,
  LF_PLACES,
  LF_SENSITIVE_CATEGORIES,
  type LfCategory,
} from "@/config/lost-found";
import type { PhotoAnalysis } from "@/lib/types";
import type { LfAnalysis, LfAnalyzeRequest } from "@/lib/lost-found/analysis";
import { downloadComplaintPhoto } from "@/lib/photos";
import { scrubNumbers } from "@/lib/lost-found/text";
import type { LostFoundItem } from "@/lib/lost-found/types";
import { moderationRules } from "./analyze";
import { PhotoModerationSchema, TextModerationSchema } from "./complaint";
import { keywordOverlap } from "./duplicates";
import { generateStructured, imagePart, textPart, type AiResult } from "./gemini";

// ---------------------------------------------------------------------------
// 1. Report analysis: one call, structured JSON, the same moderation rules as complaints
// ---------------------------------------------------------------------------
function buildSchema(hasPhoto: boolean) {
  const full = z.object({
    text_moderation: TextModerationSchema,
    photo_moderation: PhotoModerationSchema.optional(),
    language: z.string().describe('"en" for English, "hi" for Hindi (Devanagari or Hinglish), otherwise the ISO 639-1 code'),
    title: z.string().describe("Clean English title, at most 8 words, e.g. 'Black JBL earbuds case'. No names or ID numbers"),
    public_description: z
      .string()
      .describe("1-2 English sentences anyone may read: what it looks like. NO person names, NO ID / phone / card numbers, NO description of the contents of a wallet, bag or phone"),
    english_description: z.string().describe("Faithful English version of what the reporter wrote (cleaned copy if already English)"),
    item_category: z.enum(LF_CATEGORIES),
    color: z.string().describe("Main colour(s), e.g. 'black'; empty string if unknown"),
    brand: z.string().describe("Brand or make if visible or stated (e.g. 'JBL'); empty string if unknown"),
    marks: z.string().describe("Distinguishing marks: stickers, scratches, keychains, engraved initials, case colour; empty string if none"),
    sensitive: z.boolean().describe("true for valuables or identity items: phone, wallet, laptop, ID / bank / credit cards, documents, cash, jewellery"),
    extracted_location: z.object({
      building: z.string().describe("Exact building name from the list if mentioned, else empty string"),
      spot: z.string().describe("Exact spot (library, court 2, bench...) if mentioned, else empty string"),
    }),
    verification_question: z
      .string()
      .describe("FOUND items only: one short question only the real owner could answer (a hidden detail: lock-screen wallpaper, a sticker, what is inside the front pocket). It must NOT reveal the answer or the detail itself. Empty string for LOST items"),
    photo_analysis: z.object({
      observed: z.string().describe("What the photo shows, neutrally; empty string if no photo"),
      matches_complaint: z.boolean().describe("Does the photo match the text? true if no photo"),
      notes: z.string().describe("Anything useful for matching; empty if no photo"),
    }),
  });
  return (hasPhoto ? full.extend({ photo_moderation: PhotoModerationSchema }) : full.omit({ photo_moderation: true })) as unknown as typeof full;
}

function analysisSystem(type: "lost" | "found", hasPhoto: boolean): string {
  return `You are the Lost & Found assistant of CampusConnect at ${COLLEGE_NAME}, an Indian college.
A student or faculty member is posting a ${type.toUpperCase()} item (${type === "lost" ? "they lost it" : "they found it"}). They may write in English, Hindi or Hinglish.
Turn the post into a clean, structured listing that can be matched against posts of the opposite kind.

CAMPUS LOCATIONS: ${LF_PLACES.join(", ")}.

${moderationRules("hostel", hasPhoto)}
LOST & FOUND NOTES: this is a post about an object, not a complaint, so judge "allow / block" only on abuse, spam, gibberish or jokes. A face printed on an ID card or document is NOT a person: contains_people = false and level "allow" (the item is then sensitive). Photos of personal belongings are the whole point and are allowed.

RULES:
1. item_category MUST be one of: ${LF_CATEGORIES.join(", ")}. Earbuds / headphones / AirPods = Earphones; chargers, laptops, power banks = Laptop / charger; student card, library card, Aadhaar, bank card = ID card.
2. title, public_description and english_description are ALWAYS English. title and public_description must NEVER contain a person's name, a roll number, a phone number or any ID / card number, and must not list the contents of a wallet, bag or phone. Describe only colour, type, brand and general look.
3. color, brand, marks: only what the text or photo actually shows or says. Never guess a brand. Empty string when unknown.
4. sensitive = true for phones, wallets, laptops, ID / bank cards, documents, cash, jewellery; false for ordinary items (bottle, umbrella, earbuds, book, clothing, keys).
5. extracted_location: copy building / spot only when mentioned in the text; use the exact building names from the list. Empty string otherwise.
6. verification_question: ${type === "found" ? "REQUIRED for a found item. Ask about a hidden or non-obvious detail (never the colour or type, which are public), e.g. 'What is the wallpaper on the lock screen?' or 'Which sticker is on the inside of the lid?'. Do not reveal the answer." : "empty string for lost items."}
7. photo: if attached, describe it neutrally in photo_analysis. Never identify people. If none: observed = "", matches_complaint = true, notes = "".`;
}

export interface LfAnalyzeInput extends LfAnalyzeRequest {
  photo?: { base64: string; mimeType: string } | null;
}

function cleanTitle(title: string): string {
  return title.trim().split(/\s+/).slice(0, 8).join(" ");
}

/** Gemini output -> a safe, normalised analysis (category and sensitivity enforced in code). */
export async function analyzeLostFound(input: LfAnalyzeInput): Promise<AiResult<LfAnalysis>> {
  const hasPhoto = !!input.photo;
  const parts: Part[] = [
    textPart(
      [
        `TYPE: ${input.type.toUpperCase()}`,
        `PLACE FROM THE FORM: ${[input.building, input.spot].filter(Boolean).join(", ") || "(not given)"}`,
        `WHAT THEY WROTE:\n"""${input.text}"""`,
        hasPhoto ? "A photo of the item is attached." : "No photo attached.",
      ].join("\n\n"),
    ),
  ];
  if (input.photo) parts.push(imagePart(input.photo.base64, input.photo.mimeType));

  const res = await generateStructured({
    schema: buildSchema(hasPhoto),
    system: analysisSystem(input.type, hasPhoto),
    prompt: parts,
    timeoutMs: 25_000,
    relaxedSafety: true,
  });
  if (!res.ok) return { ok: false, error: res.error, model: res.model, ms: res.ms };

  const raw = res.data;
  const category: LfCategory = isLfCategory(raw.item_category) ? raw.item_category : "Other";
  const buildingMatch = LF_PLACES.find((b) => b.toLowerCase() === raw.extracted_location.building.trim().toLowerCase());
  const photoMod = input.photo
    ? (raw.photo_moderation ?? { level: "allow" as const, reason: "", contains_people: false })
    : null;
  const photo_analysis: PhotoAnalysis | null = input.photo ? raw.photo_analysis : null;

  const analysis: LfAnalysis = {
    language: (raw.language || "en").toLowerCase().slice(0, 5),
    title: scrubNumbers(cleanTitle(raw.title)) || "Item",
    public_description: scrubNumbers(raw.public_description),
    english_description: raw.english_description || input.text,
    item_category: category,
    color: raw.color.trim(),
    brand: raw.brand.trim(),
    marks: raw.marks.trim(),
    sensitive: raw.sensitive || LF_SENSITIVE_CATEGORIES.includes(category),
    location: {
      building: input.building || buildingMatch || null,
      spot: input.spot?.trim() || raw.extracted_location.spot.trim() || null,
    },
    verification_question: input.type === "found" ? raw.verification_question.trim() : "",
    photo_analysis,
    moderation: { text: raw.text_moderation, photo: photoMod },
    model: res.model,
  };
  return { ok: true, data: analysis, model: res.model, ms: res.ms };
}

/** Manual fallback when the AI is unavailable: the reporter fills the listing in by hand. */
export function manualAnalysis(input: LfAnalyzeRequest): LfAnalysis {
  return {
    language: "en",
    title: cleanTitle(input.text),
    public_description: "",
    english_description: input.text,
    item_category: "Other",
    color: "",
    brand: "",
    marks: "",
    sensitive: false,
    location: { building: input.building, spot: input.spot },
    verification_question: "",
    photo_analysis: null,
    moderation: { text: { level: "allow", reason: "" }, photo: null },
    model: "manual",
  };
}

// ---------------------------------------------------------------------------
// 2. Matching: descriptions + photos of a new item against open items of the opposite kind
// ---------------------------------------------------------------------------
const CompareSchema = z.object({
  results: z.array(
    z.object({
      item_no: z.string(),
      score: z.number().min(0).max(1).describe("0 = clearly different objects, 1 = almost certainly the same object"),
      reason: z.string().describe("One sentence, English, what matches or differs (type, colour, brand, marks, place, time)"),
    }),
  ),
});

export interface MatchScore {
  candidate: LostFoundItem;
  score: number;
  reason: string;
}

const MAX_CANDIDATES = 6;
const MAX_IMAGES = 6;

/** One line per item. Private details are fine here: this text only goes to Gemini. */
function describeItem(i: LostFoundItem): string {
  const bits = [
    `category=${i.item_category}`,
    i.color && `colour=${i.color}`,
    i.brand && `brand=${i.brand}`,
    i.marks && `marks=${i.marks}`,
    `place=${[i.building, i.spot].filter(Boolean).join(", ") || "unknown"}`,
    `when=${i.happened_at.slice(0, 10)}`,
  ].filter(Boolean);
  return `${i.item_no} | ${i.title} | ${bits.join("; ")} | ${i.description.slice(0, 300)}`;
}

/** Fallback when Gemini is unavailable: word overlap, boosted by category / colour / brand agreement. */
function keywordScore(a: LostFoundItem, b: LostFoundItem): number {
  const text = (i: LostFoundItem) => [i.title, i.color, i.brand, i.marks, i.description].filter(Boolean).join(" ");
  let score = keywordOverlap(text(a), text(b)) * 0.7;
  if (a.item_category === b.item_category && a.item_category !== "Other") score += 0.1;
  if (a.color && b.color && a.color.toLowerCase() === b.color.toLowerCase()) score += 0.1;
  if (a.brand && b.brand && a.brand.toLowerCase() === b.brand.toLowerCase()) score += 0.1;
  return Math.min(1, Math.round(score * 100) / 100);
}

/**
 * Scores every candidate against `item` (0-1). Gemini sees the descriptions and up to
 * MAX_IMAGES photos; if it fails the keyword fallback is used so matching never breaks.
 */
export async function scoreMatches(item: LostFoundItem, candidates: LostFoundItem[]): Promise<MatchScore[]> {
  const pool = candidates.slice(0, MAX_CANDIDATES);
  if (pool.length === 0) return [];

  const parts: Part[] = [
    textPart(
      `NEW ${item.type.toUpperCase()} ITEM\n${describeItem(item)}\n\nOPEN ${pool[0].type.toUpperCase()} ITEMS TO COMPARE\n${pool.map(describeItem).join("\n")}\n\nScore every listed item against the new one. Photos follow, each labelled.`,
    ),
  ];
  let images = 0;
  const attach = async (label: string, path: string | null) => {
    if (!path || images >= MAX_IMAGES) return;
    const photo = await downloadComplaintPhoto(path);
    if (!photo) return;
    parts.push(textPart(`Photo of ${label}:`), imagePart(photo.base64, photo.mimeType));
    images++;
  };
  await attach(`NEW item ${item.item_no}`, item.photo_path);
  for (const c of pool) await attach(c.item_no, c.photo_path);

  const res = await generateStructured({
    schema: CompareSchema,
    system:
      "You match lost-property reports on a college campus. A LOST item and a FOUND item match only if they could be the SAME physical object: same kind of item, compatible colour, brand and distinguishing marks, plausible place and time. A different brand, colour or kind of item is a clear mismatch (score below 0.3). Similar category alone is not enough (0.3-0.5). Score 0.7+ only when the details line up and nothing contradicts. Use photos when given. Judge every listed item.",
    prompt: parts,
    timeoutMs: 30_000,
  });

  if (res.ok) {
    const byNo = new Map(res.data.results.map((r) => [r.item_no.trim(), r]));
    return pool.map((c) => {
      const r = byNo.get(c.item_no);
      return { candidate: c, score: r ? Math.round(r.score * 100) / 100 : 0, reason: r?.reason ?? "" };
    });
  }
  console.error("[lost-found] match fell back to keywords:", res.error.slice(0, 160));
  return pool.map((c) => ({
    candidate: c,
    score: keywordScore(item, c),
    reason: "Similar description (matched on shared words, colour and brand).",
  }));
}
