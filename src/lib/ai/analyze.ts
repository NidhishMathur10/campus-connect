import "server-only";
import type { Part } from "@google/genai";
import { COLLEGE_NAME } from "@/config/college";
import { BUILDING_INFO, BUILDINGS, FLOORS, locationsPromptText, type Building } from "@/config/locations";
import {
  categoriesFor,
  getRoutingRule,
  ROUTING,
  routingGuidePromptText,
  SAFETY_HAZARDS,
  type Category,
  type Department,
  type TicketModule,
} from "@/config/routing";
import type { PhotoAnalysis } from "@/lib/types";
import { generateStructured, imagePart, textPart, type AiResult } from "./gemini";
import {
  buildAnalysisSchema,
  type ComplaintAnalysis,
  type ComplaintLocation,
  type FollowUpAnswer,
  type RawAnalysis,
} from "./complaint";

export interface AnalyzeInput {
  module: TicketModule;
  text: string;
  location: ComplaintLocation;
  photo?: { base64: string; mimeType: string } | null;
  /** Round 2 only: the AI's questions and the student's reply. */
  followUp?: FollowUpAnswer | null;
  previousPhotoAnalysis?: PhotoAnalysis | null;
}

/** Floors don't matter for these buildings (single-hall messes, gym, courts). */
function floorNeeded(building: string | null): boolean {
  if (!building) return true;
  const kind = BUILDING_INFO[building as Building]?.kind;
  return kind === "hostel" || kind === "academic";
}

/** In a mess the "spot" is the meal, which the Mess Food rule already asks for. */
function spotNeeded(building: string | null): boolean {
  return !building || BUILDING_INFO[building as Building]?.kind !== "mess";
}

const DEVANAGARI = /[ऀ-ॿ]/;

function requiredDetailsText(module: TicketModule): string {
  const perCategory = ROUTING[module]
    .filter((r) => r.requiredDetails)
    .map((r) => `- ${r.category}: ${r.requiredDetails}`)
    .join("\n");
  return [
    "- Every complaint: building, floor (only for hostels and academic blocks — not for messes, Gym or Sports Complex), and the exact spot (room number, washroom, corridor, court, classroom...) — not for messes, where the meal is enough.",
    perCategory,
  ]
    .filter(Boolean)
    .join("\n");
}

function systemPrompt(module: TicketModule): string {
  return `You are the complaint intake assistant of CampusConnect at ${COLLEGE_NAME}, an Indian college.
Students describe problems informally in English, Hindi or Hinglish. Turn each complaint into a clear, structured ticket.

ROUTING GUIDE (${module === "hostel" ? "Hostel & Campus" : "Education / academic"} module):
${routingGuidePromptText(module)}

CAMPUS LOCATIONS:
${locationsPromptText()}

REQUIRED DETAILS:
${requiredDetailsText(module)}

RULES:
1. language: "en" for English, "hi" for Hindi (Devanagari or romanised Hinglish), otherwise the ISO 639-1 code.
2. english_text: a faithful English translation (if the complaint is in English, a lightly cleaned copy).
3. title (max 8 words), summary (2-3 sentences, for staff, mention the location) and extracted_issue are ALWAYS in English.
4. Pick category and department ONLY from the routing guide. Use the default priority for the category unless there is a clear reason to raise it (many students affected, hygiene risk, no water at all).
5. SAFETY: if there is any safety hazard (${SAFETY_HAZARDS}) in the text OR the photo, set is_safety_hazard = true and priority = "Urgent".
6. confidence (0-1) and a one-sentence reason for category, department and priority.
7. Photo: if a photo is attached, describe what it shows, say whether it matches the complaint, and add useful notes for staff. If no photo is attached: observed = "", matches_complaint = true, notes = "".
8. extracted_location: copy building / floor / spot / machine ID that appear in the complaint or the student's answers, using the exact names from the location list. Empty string when not mentioned.
9. missing_fields: required details that are still unknown after reading the form location, the complaint text and any answers. Never ask for something already given. A vague description (e.g. just "water is leaking") counts as missing "what exactly is happening".
10. follow_up_questions: at most 3 short, friendly questions, one per missing detail, written in the SAME language and script the student used. Empty list when nothing is missing.
   - Complaint in Devanagari (e.g. "पानी लीक हो रहा है") → questions in Devanagari Hindi, e.g. "पानी कहाँ से लीक हो रहा है — नल, पाइप या फ्लश?"
   - Complaint in romanised Hinglish (e.g. "paani leak ho raha hai") → questions in Hinglish.
   - Complaint in English → questions in English.`;
}

function formLocationText(loc: ComplaintLocation): string {
  return [
    `Building: ${loc.building || "(not selected)"}`,
    `Floor: ${loc.floor || "(not selected)"}`,
    `Spot: ${loc.spot || "(not given)"}`,
    `Washing machine ID: ${loc.machine_id || "(none)"}`,
  ].join("\n");
}

function userPrompt(input: AnalyzeInput): string {
  const parts = [
    `LOCATION FROM THE FORM:\n${formLocationText(input.location)}`,
    `STUDENT'S COMPLAINT:\n"""${input.text}"""`,
  ];
  if (input.followUp) {
    parts.push(
      `YOU ALREADY ASKED:\n${input.followUp.questions.map((q) => `- ${q}`).join("\n")}\n\nSTUDENT'S REPLY:\n"""${input.followUp.answer || "(no reply)"}"""`,
      "This was the ONLY follow-up round. Use the reply to complete the ticket. follow_up_questions MUST be an empty list; list in missing_fields only details that are still unknown.",
    );
  }
  if (DEVANAGARI.test(input.text)) {
    parts.push("The complaint is written in Devanagari, so every follow-up question MUST be in Devanagari Hindi (not romanised).");
  }
  if (input.photo) parts.push("A photo from the student is attached.");
  else if (input.previousPhotoAnalysis?.observed) {
    parts.push(`Earlier photo analysis (photo not re-attached): ${input.previousPhotoAnalysis.observed}`);
  } else parts.push("No photo attached.");
  return parts.join("\n\n");
}

function pick<T extends string>(value: string | null | undefined, allowed: readonly T[]): T | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) ?? null;
}

/** Gemini output → safe, normalised analysis (routing guide enforced in code). */
function normalise(
  module: TicketModule,
  input: AnalyzeInput,
  raw: RawAnalysis,
  model: string,
): ComplaintAnalysis {
  const category = (pick(raw.category, categoriesFor(module)) ?? "Other") as Category;
  const rule = getRoutingRule(module, category);
  const department: Department = rule.departments.includes(raw.department)
    ? raw.department
    : rule.departments[0];
  const priority = raw.is_safety_hazard ? "Urgent" : raw.priority;

  const ex = raw.extracted_location;
  const location: ComplaintLocation = {
    building: input.location.building || pick(ex.building, BUILDINGS),
    floor: input.location.floor || pick(ex.floor, FLOORS),
    spot: input.location.spot?.trim() || ex.spot.trim() || null,
    machine_id: input.location.machine_id || ex.machine_id.trim().toUpperCase() || null,
  };

  // Deterministic safety net for location gaps the model may have missed.
  const missing = [...raw.missing_fields];
  const has = (word: string) => missing.some((m) => m.toLowerCase().includes(word));
  if (!location.building && !has("building")) missing.push("building");
  if (!location.floor && floorNeeded(location.building) && !has("floor")) missing.push("floor");
  if (!location.spot && spotNeeded(location.building) && !has("spot")) missing.push("exact spot");
  if (category === "Laundry" && !location.machine_id && !has("machine")) missing.push("machine ID");
  // Drop location gaps the form/answers have already filled.
  const filtered = missing.filter((m) => {
    const l = m.toLowerCase();
    if (l.includes("building")) return !location.building;
    if (l.includes("floor")) return !location.floor && floorNeeded(location.building);
    if (l.includes("spot")) return !location.spot && spotNeeded(location.building);
    if (l.includes("machine")) return !location.machine_id;
    return true;
  });

  const photo: PhotoAnalysis | null = input.photo
    ? raw.photo_analysis
    : (input.previousPhotoAnalysis ?? null);

  return {
    language: (raw.language || "en").toLowerCase().slice(0, 5),
    english_text: raw.english_text || input.text,
    title: raw.title.split(/\s+/).slice(0, 8).join(" "),
    summary: raw.summary,
    extracted_issue: raw.extracted_issue,
    category,
    department,
    priority,
    is_safety_hazard: raw.is_safety_hazard,
    confidence: raw.confidence,
    reasons: raw.reasons,
    photo_analysis: photo,
    location,
    missing_fields: filtered,
    follow_up_questions: input.followUp ? [] : raw.follow_up_questions.slice(0, 3),
    model,
  };
}

/** CLAUDE.md §6.1 — interpret a complaint (text + location + optional photo). Never throws. */
export async function analyzeComplaint(
  input: AnalyzeInput,
): Promise<AiResult<ComplaintAnalysis>> {
  const prompt: Part[] = [textPart(userPrompt(input))];
  if (input.photo) prompt.push(imagePart(input.photo.base64, input.photo.mimeType));

  const result = await generateStructured({
    schema: buildAnalysisSchema(input.module),
    system: systemPrompt(input.module),
    prompt,
    timeoutMs: input.photo ? 35_000 : 25_000,
  });

  if (!result.ok) return { ok: false, error: result.error, model: result.model, ms: result.ms };
  return {
    ok: true,
    data: normalise(input.module, input, result.data, result.model),
    model: result.model,
    ms: result.ms,
  };
}
