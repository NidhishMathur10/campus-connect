import "server-only";
import type { Part } from "@google/genai";
import { COLLEGE_NAME } from "@/config/college";
import {
  BUILDING_INFO,
  BUILDINGS,
  FLOORS,
  floorFromRoom,
  HOSTEL_COMMON_AREAS,
  isHostelBuilding,
  LIBRARY_BUILDING,
  locationsPromptText,
  normaliseRoom,
  parseRoomCode,
  SCOPE_CATEGORIES,
  type Building,
  type TicketScope,
} from "@/config/locations";
import {
  CLASS_DISRUPTION_REASON,
  mentionsUpcomingClass,
  type ReporterAudience,
} from "@/config/faculty";
import {
  categoriesFor,
  getRoutingRule,
  NON_LOCATION_CATEGORIES,
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
  /** Who is reporting. Faculty can use the faculty-only academic categories and get the class-disruption rule. */
  audience?: ReporterAudience;
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

/** Hostel rooms have their own attached washrooms: we never ask which one. */
const WASHROOM_WORDS = /washroom|bathroom|toilet|balcony|वॉशरूम|बाथरूम|शौचालय|बालकनी/i;
const SCOPE_WORDS = /\bscope\b|whole floor|entire floor|other rooms|rooms affected|affected rooms|how many rooms|just you|only you/i;
const SCOPE_QUESTION_RE = /other rooms|whole floor|this floor|मंज़िल|मंजिल|दूसरे कमरों|कमरों/i;
const ROOM_QUESTION_RE = /room number|which room|room no|common area|कमरा|कमरे/i;

const SCOPE_QUESTION = {
  en: "Only your room, or other rooms on this floor too?",
  hi: "क्या यह सिर्फ़ आपके कमरे में है, या इस मंज़िल के दूसरे कमरों में भी?",
};
const ROOM_QUESTION = {
  en: "Which room number is this in? (Or tell me if it's a common area like the corridor, staircase or water cooler.)",
  hi: "यह किस कमरे में है? (या बताइए कि यह कोई कॉमन जगह है — जैसे कॉरिडोर, सीढ़ियाँ या वॉटर कूलर।)",
};

/** Hostel follow-ups: drop "which washroom?" questions and make sure room / scope are asked. */
function hostelQuestions(module: TicketModule, ai: string[], missing: string[], hindi: boolean): string[] {
  if (module !== "hostel") return [...ai];
  const out = ai.filter((q) => !WASHROOM_WORDS.test(q));
  const lang = hindi ? "hi" : "en";
  if (missing.includes("scope") && !out.some((q) => SCOPE_QUESTION_RE.test(q))) out.push(SCOPE_QUESTION[lang]);
  if (missing.includes("room number or common area") && !out.some((q) => ROOM_QUESTION_RE.test(q))) out.push(ROOM_QUESTION[lang]);
  return out;
}

const PLACE_QUESTION_RE = /block|room|which class|कमरा|कमरे|ब्लॉक/i;
const CLASS_TIME_RE = /time|when|what time|कब|कितने बजे/i;
const FACULTY_QUESTIONS = {
  en: { place: "Which block and room is this in? (e.g. Block C, room C-204)", time: "What time is your class?" },
  hi: { place: "यह किस ब्लॉक और कमरे में है? (जैसे ब्लॉक C, कमरा C-204)", time: "आपकी क्लास कितने बजे है?" },
};

/** Faculty follow-ups: make sure the block/room and (when a class is affected) the class time are asked. */
function facultyQuestions(ai: string[], missing: string[], hindi: boolean): string[] {
  const out = [...ai];
  const lang = hindi ? "hi" : "en";
  const gaps = missing.map((m) => m.toLowerCase());
  const placeMissing = gaps.some((m) => /block|floor|room|spot|location/.test(m));
  if (placeMissing && !out.some((q) => PLACE_QUESTION_RE.test(q))) out.push(FACULTY_QUESTIONS[lang].place);
  if (gaps.some((m) => m.includes("class time")) && !out.some((q) => CLASS_TIME_RE.test(q))) {
    out.push(FACULTY_QUESTIONS[lang].time);
  }
  return out;
}

function requiredDetailsText(module: TicketModule, audience: ReporterAudience): string {
  const perCategory = ROUTING[module]
    .filter((r) => r.requiredDetails && (audience === "faculty" || !r.facultyOnly))
    .map((r) => `- ${r.category}: ${r.requiredDetails}`)
    .join("\n");
  const location =
    module === "academic"
      ? `- Classroom Facilities / Lab Equipment / Library${audience === "faculty" ? " / Electricity / Internet / Cleanliness" : ""}: the block (Block A-D), floor and room or lab number. Room codes like "B-204" mean Block B, 2nd floor (first digit = floor, 0 = Ground). The Library is in Block A.${audience === "faculty" ? " For a faculty report ALWAYS get both the block and the room." : ""}
- Academic Admin (timetable, attendance, marks): NO physical location - never ask for block, floor or room.`
      : `- Hostel (Old Hostel / New Hostel): building, floor, and EITHER the ROOM NUMBER OR, for a shared space, the common area (${HOSTEL_COMMON_AREAS.join(", ")}). Every room has its own attached washroom, bathroom and balcony and there are NO common washrooms, so NEVER ask which washroom or bathroom — the room number is enough (details go in the complaint text).
- Water Supply (no water / low pressure), Electricity (power cut) and Internet (Wi-Fi outage / slow Wi-Fi): also the SCOPE — "Only your room, or other rooms on this floor too?" (scope_applies = true). For a single faulty item inside the room (a fan, a tap, a geyser, a LAN port) scope_applies = false and you must NOT ask.
- Messes, Gym and Sports Complex: no room; floor is not needed, and for messes the meal is enough.`;
  return [location, perCategory]
    .filter(Boolean)
    .join("\n");
}

function hostelLayoutNote(module: TicketModule): string {
  if (module !== "hostel") return "";
  return `
HOSTEL LAYOUT: 4 students share each room; every room has its own attached washroom, bathroom and balcony. There are no common washrooms, so a washroom / bathroom / balcony problem is a problem of that ROOM (extracted_location.room_no). Never ask which washroom.
`;
}

/** Safety & Security: separate, supportive prompt (CLAUDE.md §12). */
function securitySystemPrompt(): string {
  return `You are the confidential safety-report assistant of CampusConnect at ${COLLEGE_NAME}, an Indian college.
A student is reporting something that made them feel unsafe: ragging, harassment, bullying, a threat or fight, theft, or a suspicious person. They may write in English, Hindi or Hinglish.
Your job is to understand the report calmly and route it to the right people. The student may be scared or upset.

ROUTING GUIDE (Safety & Security module):
${routingGuidePromptText("security")}

CAMPUS LOCATIONS:
${locationsPromptText()}

TONE (very important):
- Calm, warm, supportive and non-judgmental. Thank them for speaking up.
- NEVER ask the student to justify themselves, prove anything, or explain why they did not report earlier.
- NEVER ask for names of the people involved or of witnesses. If names were given, keep them only in english_text.
- Do not give legal or medical advice.

RULES:
1. language: "en" for English, "hi" for Hindi (Devanagari or romanised Hinglish), otherwise the ISO 639-1 code.
2. english_text: a faithful English translation (if already English, a lightly cleaned copy).
3. title (max 8 words, neutral, no names), summary (2-3 factual sentences for the investigating staff — no names) and extracted_issue are ALWAYS in English.
4. Pick category and department ONLY from the routing guide. Use the guide's priority.
5. is_emergency = true ONLY if the student may be in immediate danger right now (being attacked, followed, locked in, threatened at this moment, injured). Then priority = "Urgent".
6. is_safety_hazard: true for ragging, harassment, threats or violence.
7. confidence (0-1) and a one-sentence reason for category, department and priority.
8. Photo: if attached, describe it neutrally; otherwise observed = "", matches_complaint = true, notes = "".
9. extracted_location: building / floor / spot from the text or answers, using the exact names from the list. Empty string when not mentioned.
10. The ONLY details you may ask about are WHEN it happened and WHERE it happened. missing_fields may contain only "when" and/or "where". "where" is known if a building is in the form or the text.
11. follow_up_questions: at most 2 short, gentle questions (only about when / where), in the SAME language and script the student used. Empty list when nothing is missing.
   - Devanagari Hindi example: "हमें बताने के लिए धन्यवाद। यह लगभग कब हुआ था — कौन सा दिन और कितने बजे?"
   - English example: "Thank you for telling us. Roughly when did this happen?"`;
}

/** Faculty reports: same intake, plus the "a class is affected" priority rule. */
function facultyNote(): string {
  return `
THE REPORTER IS A FACULTY MEMBER (teacher / HOD / academic office), not a student. They report problems in the academic blocks (Blocks A-D): classroom facilities, lab equipment, library, academic admin, and electricity, Wi-Fi/internet or cleanliness in a block. Be concise and professional.
CLASS RULE: if they mention a class, lecture, lab or exam that is happening now or soon (e.g. "I have a class at 2", "lecture in 10 minutes", "students are waiting") and the problem affects it, set disrupts_class = true, set priority to at least "High" (keep "Urgent" for safety hazards), and make the priority reason exactly "${CLASS_DISRUPTION_REASON}". If they mention a class but not when, add "class time" to missing_fields and ask when the class is. Otherwise disrupts_class = false.
ALWAYS get the block AND the room (e.g. "Block C, room C-204") for any faculty report about a physical place; ask for whatever is missing in one question.
`;
}

function systemPrompt(module: TicketModule, audience: ReporterAudience): string {
  if (module === "security") return securitySystemPrompt();
  const faculty = audience === "faculty";
  return `You are the complaint intake assistant of CampusConnect at ${COLLEGE_NAME}, an Indian college.
${faculty ? "Faculty members" : "Students"} describe problems informally in English, Hindi or Hinglish. Turn each complaint into a clear, structured ticket.

ROUTING GUIDE (${module === "hostel" ? "Hostel & Campus" : "Education / academic"} module):
${routingGuidePromptText(module, audience)}
${faculty ? facultyNote() : ""}
CAMPUS LOCATIONS:
${locationsPromptText()}
${hostelLayoutNote(module)}
REQUIRED DETAILS:
${requiredDetailsText(module, audience)}

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
    `Room number: ${loc.room_no || "(not given)"}`,
    `Common area / spot: ${loc.spot || "(not given)"}`,
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
  const audience = input.audience ?? "student";
  const category = (pick(raw.category, categoriesFor(module, audience)) ?? "Other") as Category;
  const rule = getRoutingRule(module, category);
  const department: Department = rule.departments.includes(raw.department)
    ? raw.department
    : rule.departments[0];
  const isSecurity = module === "security";
  const isEmergency = isSecurity && raw.is_emergency;
  // Safety reports use the guide's priority (Urgent for ragging/harassment/threats).
  const priority = isEmergency
    ? "Urgent"
    : isSecurity
      ? rule.defaultPriority
      : raw.is_safety_hazard
        ? "Urgent"
        : raw.priority;

  // Faculty: a class happening now or soon raises the priority to at least High.
  const classAffected =
    audience === "faculty" && !isSecurity && (raw.disrupts_class || mentionsUpcomingClass(`${input.text} ${input.followUp?.answer ?? ""}`));
  const raisedForClass = classAffected && (priority === "Low" || priority === "Medium");
  const finalPriority = raisedForClass ? "High" : priority;
  // Urgent safety hazards keep the AI's own reason; otherwise the class is why this is High.
  const reasons = classAffected && finalPriority !== "Urgent" ? { ...raw.reasons, priority: CLASS_DISRUPTION_REASON } : raw.reasons;

  const ex = raw.extracted_location;
  const location: ComplaintLocation = {
    building: input.location.building || pick(ex.building, BUILDINGS),
    floor: input.location.floor || pick(ex.floor, FLOORS),
    room_no: normaliseRoom(input.location.room_no) || normaliseRoom(ex.room_no),
    spot: input.location.spot?.trim() || ex.spot.trim() || null,
    machine_id: input.location.machine_id || ex.machine_id.trim().toUpperCase() || null,
  };

  // Safety reports only ever ask "when" and "where".
  if (isSecurity) {
    const gaps = raw.missing_fields.map((m) => m.toLowerCase());
    const missingWhen = gaps.some((m) => /when|time|date|day/.test(m));
    const missingWhere = !location.building && !location.spot;
    return {
      language: (raw.language || "en").toLowerCase().slice(0, 5),
      english_text: raw.english_text || input.text,
      title: raw.title.split(/\s+/).slice(0, 8).join(" "),
      summary: raw.summary,
      extracted_issue: raw.extracted_issue,
      category,
      department,
      priority,
      is_safety_hazard: !!rule.escalateToDean || raw.is_safety_hazard,
      scope: null,
      is_emergency: isEmergency,
      confidence: raw.confidence,
      reasons: raw.reasons,
      photo_analysis: input.photo ? raw.photo_analysis : (input.previousPhotoAnalysis ?? null),
      location,
      missing_fields: [missingWhen && "when", missingWhere && "where"].filter((m): m is string => !!m),
      follow_up_questions: input.followUp || (!missingWhen && !missingWhere) ? [] : raw.follow_up_questions.slice(0, 2),
      model,
    };
  }

  // Academic module: room codes fill block + floor; the Library is in Block A;
  // records issues (attendance, marks, timetable) have no physical location at all.
  const noLocation = module === "academic" && NON_LOCATION_CATEGORIES.includes(category);
  if (module === "academic" && !noLocation) {
    const room = parseRoomCode(location.spot);
    location.building ??= room?.building ?? null;
    location.floor ??= room && room.building === location.building ? room.floor : null;
    if (category === "Library") {
      location.building ??= LIBRARY_BUILDING;
      location.spot ??= "Library";
    }
  }
  const needFloor = (building: string | null) =>
    floorNeeded(building) && !(module === "academic" && category === "Library");

  // Hostel: a place is a ROOM NUMBER or a COMMON AREA (never "which washroom").
  const hostelPlace = module === "hostel" && isHostelBuilding(location.building);
  const placeKnown = !!location.room_no || !!location.spot;
  if (hostelPlace) location.floor ??= floorFromRoom(location.room_no);

  // Scope (room / floor / building) for water, power cut and Wi-Fi outages.
  const scopeApplies = hostelPlace && SCOPE_CATEGORIES.includes(category) && raw.scope_applies;
  const aiScope: TicketScope | null = raw.scope === "unknown" ? null : raw.scope;
  const scope: TicketScope | null = hostelPlace && !scopeApplies && location.room_no ? "room" : scopeApplies ? aiScope : null;

  // Deterministic safety net for location gaps the model may have missed.
  const missing = [...raw.missing_fields];
  const has = (word: string) => missing.some((m) => m.toLowerCase().includes(word));
  if (!noLocation) {
    if (!location.building && !has("building") && !has("block")) missing.push(module === "academic" ? "block" : "building");
    if (!location.floor && needFloor(location.building) && !has("floor")) missing.push("floor");
    if (hostelPlace) {
      if (!placeKnown && !has("room") && !has("common")) missing.push("room number or common area");
    } else if (!location.spot && spotNeeded(location.building) && !has("spot") && !has("room")) {
      missing.push(module === "academic" ? "room number" : "exact spot");
    }
  }
  if (category === "Laundry" && !location.machine_id && !has("machine")) missing.push("machine ID");
  if (scopeApplies && !scope) missing.push("scope");

  // Drop location gaps the form/answers have already filled (or that don't apply).
  const filtered = missing.filter((m, i) => {
    const l = m.toLowerCase();
    if (missing.findIndex((x) => x.toLowerCase() === l) !== i) return false; // duplicates
    const isLocation = /building|block|floor|spot|room|location|where/.test(l);
    if (noLocation) return !isLocation;
    if (module === "hostel") {
      // Never ask which washroom — and the scope gap is added by us (below), not by the model.
      if (WASHROOM_WORDS.test(l)) return false;
      if (SCOPE_WORDS.test(l)) return l === "scope" && scopeApplies && !scope;
    }
    if (l.includes("building") || l.includes("block")) return !location.building;
    if (l.includes("floor")) return !location.floor && needFloor(location.building);
    if (hostelPlace && /spot|room|common|area/.test(l)) return !placeKnown;
    if (l.includes("spot") || l.includes("room")) return !location.spot && spotNeeded(location.building);
    if (l.includes("machine")) return !location.machine_id;
    return true;
  });

  const questions = input.followUp
    ? []
    : audience === "faculty"
      ? facultyQuestions(raw.follow_up_questions, filtered, DEVANAGARI.test(input.text)).slice(0, 3)
      : hostelQuestions(module, raw.follow_up_questions, filtered, DEVANAGARI.test(input.text)).slice(0, 3);

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
    priority: finalPriority,
    is_safety_hazard: raw.is_safety_hazard,
    scope,
    is_emergency: false,
    confidence: raw.confidence,
    reasons,
    photo_analysis: photo,
    location,
    missing_fields: filtered,
    follow_up_questions: questions,
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
    schema: buildAnalysisSchema(input.module, input.audience),
    system: systemPrompt(input.module, input.audience ?? "student"),
    prompt,
    timeoutMs: input.photo ? 35_000 : 25_000,
    relaxedSafety: input.module === "security",
  });

  if (!result.ok) return { ok: false, error: result.error, model: result.model, ms: result.ms };
  return {
    ok: true,
    data: normalise(input.module, input, result.data, result.model),
    model: result.model,
    ms: result.ms,
  };
}
