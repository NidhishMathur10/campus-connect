/**
 * Complaint moderation (CLAUDE.md §16). The levels come from the same Gemini call that
 * analyses the complaint; these friendly messages are shown by the report flow.
 */
export const TEXT_LEVELS = ["allow", "rephrase", "block"] as const;
export type TextLevel = (typeof TEXT_LEVELS)[number];

export const PHOTO_LEVELS = ["allow", "privacy", "block"] as const;
export type PhotoLevel = (typeof PHOTO_LEVELS)[number];

export interface TextModeration {
  level: TextLevel;
  /** Short friendly reason in the complaint's language (empty when allowed). */
  reason: string;
}

export interface PhotoModeration {
  level: PhotoLevel;
  reason: string;
  contains_people: boolean;
}

export interface ModerationResult {
  text: TextModeration;
  /** Null when no photo was attached. */
  photo: PhotoModeration | null;
}

/** Stored in tickets.ai_meta.moderation. "unchecked" = the AI was unavailable, so staff see "Not moderated". */
export type ModerationStatus = "passed" | "unchecked";

type Lang = "en" | "hi";

export const MODERATION_MESSAGES = {
  rephrase: {
    en: "Please rephrase without abusive language — your complaint still matters.",
    hi: "कृपया अपशब्दों के बिना दोबारा लिखें — आपकी शिकायत फिर भी मायने रखती है।",
  },
  block: {
    en: "We couldn't accept this as a complaint.",
    hi: "हम इसे शिकायत के रूप में स्वीकार नहीं कर सके।",
  },
  privacy: {
    en: "This photo shows people. Please retake it without faces.",
    hi: "इस फ़ोटो में लोग दिख रहे हैं। कृपया चेहरों के बिना दोबारा फ़ोटो लें।",
  },
  photoBlock: {
    en: "This photo can't be used, so we removed it. You can still submit without it.",
    hi: "यह फ़ोटो इस्तेमाल नहीं की जा सकती, इसलिए हटा दी गई। आप इसके बिना भी शिकायत भेज सकते हैं।",
  },
  photoRemoved: {
    en: "The photo was removed — you can still submit without it.",
    hi: "फ़ोटो हटा दी गई है — आप इसके बिना भी भेज सकते हैं।",
  },
} satisfies Record<string, Record<Lang, string>>;

export const photoBlockedBySafetyFilter =
  "This photo was flagged by our safety filter, so it was removed. You can still submit without it.";

/** Repeated blocks are flagged on the warden's dashboard (no automatic bans). */
export const MODERATION_FLAG = { blocks: 3, hours: 24 } as const;
