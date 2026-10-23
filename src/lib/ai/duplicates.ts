import "server-only";
import { z } from "zod";
import { normaliseRoom, type TicketScope } from "@/config/locations";
import { ESCALATION_RULES, OPEN_STATUSES } from "@/config/statuses";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateStructured } from "./gemini";
import type { DuplicateMatch, DuplicateRequest } from "./complaint";

const CompareSchema = z.object({
  results: z.array(
    z.object({
      ticket_no: z.string(),
      is_duplicate: z.boolean(),
      similarity: z.number().min(0).max(1),
      reason: z.string().describe("One sentence, English, why it is or isn't the same problem"),
    }),
  ),
});

/** Keyword-overlap score (0-1) needed to call two reports duplicates when Gemini is unavailable. */
const KEYWORD_THRESHOLD = 0.5;

/** Below this the student isn't bothered with the "already reported?" prompt. */
const PROMPT_THRESHOLD = 0.5;
const MAX_CANDIDATES = 6;
/** Rows pulled from the DB before the room / scope rules narrow them down. */
const POOL_SIZE = 40;

type CandidateRow = {
  id: string;
  ticket_no: string;
  reporter_id: string;
  title: string;
  summary: string | null;
  english_text: string | null;
  status: string;
  photo_url: string | null;
  building: string | null;
  floor: string | null;
  room_no: string | null;
  scope: TicketScope | null;
  spot: string | null;
  created_at: string;
};

type Place = Pick<CandidateRow, "floor" | "room_no" | "scope">;

/**
 * Is `existing` a candidate duplicate of the new report? (Both already share module, category,
 * building and are still open.)
 *  - same room → yes (roommates get "Me too")
 *  - an issue that affects the whole floor / building covers every room on that floor / building
 *  - otherwise different rooms are never duplicates
 *  - no room on either side (common areas, messes, academic blocks): same floor, as before
 */
export function sharesPlace(fresh: Place, existing: Place): boolean {
  const newRoom = normaliseRoom(fresh.room_no);
  const oldRoom = normaliseRoom(existing.room_no);
  if (newRoom && oldRoom && newRoom === oldRoom) return true;
  if (fresh.scope === "building" || existing.scope === "building") return true;
  if (fresh.scope === "floor" || existing.scope === "floor") return !!fresh.floor && fresh.floor === existing.floor;
  if (!newRoom && !oldRoom) return !fresh.floor || !existing.floor || fresh.floor === existing.floor;
  return false;
}

/** "New Hostel, 2nd floor, Room 204 (affects whole floor)" for the comparison prompt. */
function describePlace(t: { building?: string | null; floor?: string | null; room_no?: string | null; spot?: string | null; scope?: TicketScope | null }): string {
  const where = [t.building, t.floor && `${t.floor} floor`, t.room_no && `Room ${t.room_no}`, t.spot].filter(Boolean).join(", ");
  const scope = t.scope === "floor" ? " (affects whole floor)" : t.scope === "building" ? " (affects whole building)" : t.scope === "room" ? " (only that room)" : "";
  return `${where || "location unknown"}${scope}`;
}

const STOPWORDS = new Set(
  "a an the is are was were be been am in on at of to for from with and or but not no my our your their its it this that these those there here has have had do does did i we you they me us room hostel please very too also still since again just need needs needed get got issue problem complaint report reported broken".split(" "),
);

/** Lower-case word set with a crude plural strip, so "hooks" matches "hook". */
function keywords(text: string): Set<string> {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return new Set(words);
}

/** Overlap coefficient: shared words / words in the shorter text. */
export function keywordOverlap(a: string, b: string): number {
  const A = keywords(a);
  const B = keywords(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / Math.min(A.size, B.size);
}

type Scored = { row: CandidateRow; similarity: number; reason: string; isDuplicate: boolean };

const devLog = (...args: unknown[]) => {
  if (process.env.NODE_ENV !== "production") console.log("[duplicates]", ...args);
};

/**
 * CLAUDE.md §6.4 — DB candidates (same module + category + building [+ floor], still open,
 * last 7 days), then Gemini judges each one. Returns the best likely match, or null.
 * Uses the service role because students can't read other students' tickets.
 */
export async function findDuplicates(
  req: DuplicateRequest,
  userId: string,
): Promise<
  | { ok: true; match: DuplicateMatch | null; checked: number; method: "gemini" | "keyword"; model: string | null }
  | { ok: false; error: string }
> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - ESCALATION_RULES.duplicateWindowDays * 86_400_000).toISOString();

  let query = admin
    .from("tickets")
    .select("id, ticket_no, reporter_id, title, summary, english_text, status, photo_url, building, floor, room_no, scope, spot, created_at")
    .eq("module", req.module)
    .eq("category", req.category)
    .in("status", OPEN_STATUSES)
    // Point students at the original report, not at tickets already flagged as copies.
    .not("duplicate_status", "in", "(flagged,merged)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(POOL_SIZE);
  query = req.building ? query.eq("building", req.building) : query.is("building", null);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  const candidates = ((data ?? []) as CandidateRow[])
    .filter((c) => sharesPlace({ floor: req.floor, room_no: req.room_no, scope: req.scope }, c))
    .slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return { ok: true, match: null, checked: 0, method: "gemini", model: null };

  const text = (t: { title: string; summary: string | null; english_text?: string | null }) =>
    `${t.title} ${t.summary ?? t.english_text ?? ""}`;
  const freshText = `${req.title} ${req.summary}`;

  // 1. Gemini compares every candidate. 2. If it fails (quota, 503, bad JSON) fall back to keywords.
  let method: "gemini" | "keyword" = "gemini";
  let model: string | null = null;
  let scored: Scored[];
  let geminiError: string | null = null;

  const list = candidates
    .map((c) => `- ${c.ticket_no} | ${c.title} | ${describePlace(c)} | ${c.summary ?? c.english_text ?? ""}`)
    .join("\n");
  const result = await generateStructured({
    schema: CompareSchema,
    system:
      "You check whether a new campus complaint describes the SAME problem as an existing open ticket (same item / same place / same fault). Similar category alone is not enough. Hostel rooms each have their own washroom, bathroom and balcony: two roommates reporting the same room's leaking tap are duplicates, but problems in different rooms are NOT, unless the problem affects a whole floor or building (no water, power cut, Wi-Fi outage) — then reports from different rooms on that floor or building ARE the same problem. Judge every candidate.",
    prompt: `NEW COMPLAINT\nTitle: ${req.title}\nLocation: ${describePlace(req)}\nSummary: ${req.summary}\nText: ${req.english_text}\n\nEXISTING OPEN TICKETS (same category and building):\n${list}`,
    timeoutMs: 20_000,
  });

  if (result.ok) {
    model = result.model;
    const byNo = new Map(result.data.results.map((r) => [r.ticket_no.trim(), r]));
    scored = candidates.map((row) => {
      const r = byNo.get(row.ticket_no);
      return {
        row,
        similarity: r?.similarity ?? 0,
        reason: r?.reason ?? "",
        isDuplicate: !!r && r.is_duplicate && r.similarity >= PROMPT_THRESHOLD,
      };
    });
  } else {
    method = "keyword";
    geminiError = result.error;
    scored = candidates.map((row) => {
      const similarity = Math.round(keywordOverlap(freshText, text(row)) * 100) / 100;
      return {
        row,
        similarity,
        reason: "Same place and category, and the descriptions share many of the same words.",
        isDuplicate: similarity >= KEYWORD_THRESHOLD,
      };
    });
  }

  devLog(`method=${method}${model ? ` model=${model}` : ""}${geminiError ? ` (gemini failed: ${geminiError.slice(0, 120)})` : ""}`);
  devLog("new:", `${req.category} | ${describePlace(req)} | ${freshText}`);
  for (const sc of scored) {
    devLog(`  ${sc.row.ticket_no} [${sc.row.status}] sim=${sc.similarity} dup=${sc.isDuplicate} own=${sc.row.reporter_id === userId} - ${sc.reason}`);
  }

  // The student's own ticket wins ("You already reported this"), then the most similar one.
  const best = scored
    .filter((x) => x.isDuplicate)
    .sort(
      (a, b) =>
        Number(b.row.reporter_id === userId) - Number(a.row.reporter_id === userId) || b.similarity - a.similarity,
    )[0];
  if (!best) return { ok: true, match: null, checked: candidates.length, method, model };
  const row = best.row;

  const { data: follow } = await admin
    .from("ticket_followers")
    .select("ticket_id")
    .eq("ticket_id", row.id)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    ok: true,
    checked: candidates.length,
    method,
    model,
    match: {
      id: row.id,
      ticket_no: row.ticket_no,
      title: row.title,
      summary: row.summary,
      status: row.status,
      photo_url: row.photo_url,
      building: row.building,
      floor: row.floor,
      room_no: row.room_no,
      scope: row.scope,
      spot: row.spot,
      created_at: row.created_at,
      similarity: best.similarity,
      reason: best.reason,
      is_own: row.reporter_id === userId,
      already_following: !!follow,
    },
  };
}
