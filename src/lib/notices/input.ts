import { z } from "zod";
import { ACADEMIC_BUILDINGS, FLOORS } from "@/config/locations";
import {
  AUDIENCE_ALL,
  HOSTEL_FLOORS,
  HOSTEL_NAMES,
  HOSTEL_WINGS,
  KNOWN_ISSUE_CATEGORIES,
  NOTICE_MODULES,
  NOTICE_TYPES,
  type NoticeAudience,
  type PosterRule,
} from "@/config/notices";
import { QA_SUBJECTS } from "@/config/qa";

/** Shared by the compose form (client) and the publish / update actions (server). */
export const NoticeInputSchema = z.object({
  module: z.enum(NOTICE_MODULES),
  type: z.enum(NOTICE_TYPES),
  title: z.string().trim().min(3, "Add a title").max(120),
  title_hi: z.string().trim().max(160).optional().nullable(),
  body: z.string().trim().min(5, "Write the notice").max(4000),
  body_hi: z.string().trim().max(5000).optional().nullable(),
  summary: z.string().trim().max(300).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  audience: z.object({
    all: z.boolean().optional(),
    buildings: z.array(z.string()).optional(),
    floors: z.array(z.string()).optional(),
    wings: z.array(z.string()).optional(),
    subjects: z.array(z.string()).optional(),
    blocks: z.array(z.string()).optional(),
    block_floors: z.array(z.string()).optional(),
  }),
  /** undefined = leave as is, null = remove, string = a file just uploaded into the poster's own folder. */
  attachment_path: z.string().max(300).nullable().optional(),
  event_at: z.string().nullable().optional(),
  expected_fix_at: z.string().nullable().optional(),
  pinned: z.boolean(),
  /** null = use the default (7 days; events: shortly after they start). */
  expires_at: z.string().nullable().optional(),
});
export type NoticeInput = z.infer<typeof NoticeInputSchema>;

const only = (values: string[] | undefined, allowed: readonly string[]) =>
  (values ?? []).filter((v, i, all) => allowed.includes(v) && all.indexOf(v) === i);

/** Keeps only audience values this poster is allowed to target; empty = everyone. */
export function sanitiseAudience(
  rule: PosterRule,
  audience: NoticeAudience,
  teacherSubjects: string[],
): NoticeAudience {
  if (rule.audience === "all-only" || audience.all) return AUDIENCE_ALL;
  const out: NoticeAudience = {};
  const set = (key: keyof NoticeAudience, values: string[]) => {
    if (values.length > 0) (out as Record<string, string[]>)[key] = values;
  };
  if (rule.audience === "hostel" || rule.audience === "campus") {
    set("buildings", only(audience.buildings, HOSTEL_NAMES));
    set("floors", only(audience.floors, HOSTEL_FLOORS));
    set("wings", only(audience.wings, HOSTEL_WINGS));
  }
  if (rule.audience === "academic" || rule.audience === "campus") {
    const subjects = QA_SUBJECTS.filter((s) => s !== "Other");
    set("subjects", only(audience.subjects, rule.ownSubjectsOnly ? teacherSubjects : subjects));
    set("blocks", only(audience.blocks, ACADEMIC_BUILDINGS));
    set("block_floors", only(audience.block_floors, FLOORS));
  }
  return Object.keys(out).length > 0 ? out : AUDIENCE_ALL;
}

/** A known issue needs a hostel / academic module and one of that module's routing categories. */
export function knownIssueCategoryOk(module: string, category: string | null | undefined): boolean {
  if (module !== "hostel" && module !== "academic") return false;
  return !!category && (KNOWN_ISSUE_CATEGORIES[module] as readonly string[]).includes(category);
}
