import "server-only";
import { z } from "zod";
import { ESCALATION_RULES } from "@/config/statuses";
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

/** Below this the student isn't bothered with the "already reported?" prompt. */
const PROMPT_THRESHOLD = 0.5;
const MAX_CANDIDATES = 6;

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
  spot: string | null;
  created_at: string;
};

/**
 * CLAUDE.md §6.4 — DB candidates (same module + category + building [+ floor], still open,
 * last 7 days), then Gemini judges each one. Returns the best likely match, or null.
 * Uses the service role because students can't read other students' tickets.
 */
export async function findDuplicates(
  req: DuplicateRequest,
  userId: string,
): Promise<{ ok: true; match: DuplicateMatch | null; checked: number } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - ESCALATION_RULES.duplicateWindowDays * 86_400_000).toISOString();

  let query = admin
    .from("tickets")
    .select("id, ticket_no, reporter_id, title, summary, english_text, status, photo_url, building, floor, spot, created_at")
    .eq("module", req.module)
    .eq("category", req.category)
    .not("status", "in", "(Resolved,Closed,Merged)")
    // Point students at the original report, not at tickets already flagged as copies.
    .not("duplicate_status", "in", "(flagged,merged)")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  query = req.building ? query.eq("building", req.building) : query.is("building", null);
  if (req.floor) query = query.eq("floor", req.floor);

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  const candidates = (data ?? []) as CandidateRow[];
  if (candidates.length === 0) return { ok: true, match: null, checked: 0 };

  const list = candidates
    .map(
      (c) =>
        `- ${c.ticket_no} | ${c.title} | spot: ${c.spot ?? "?"} | ${c.summary ?? c.english_text ?? ""}`,
    )
    .join("\n");

  const result = await generateStructured({
    schema: CompareSchema,
    system:
      "You check whether a new campus complaint describes the SAME physical problem as an existing open ticket (same item / same spot / same fault). Similar category alone is not enough: two different broken taps in different washrooms are not duplicates. Judge every candidate.",
    prompt: `NEW COMPLAINT\nTitle: ${req.title}\nLocation: ${[req.building, req.floor, req.spot].filter(Boolean).join(", ")}\nSummary: ${req.summary}\nText: ${req.english_text}\n\nEXISTING OPEN TICKETS (same category and building):\n${list}`,
    timeoutMs: 20_000,
  });
  if (!result.ok) return { ok: false, error: result.error };

  const best = result.data.results
    .filter((r) => r.is_duplicate && r.similarity >= PROMPT_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)[0];
  const row = best && candidates.find((c) => c.ticket_no === best.ticket_no.trim());
  if (!best || !row) return { ok: true, match: null, checked: candidates.length };

  const { data: follow } = await admin
    .from("ticket_followers")
    .select("ticket_id")
    .eq("ticket_id", row.id)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    ok: true,
    checked: candidates.length,
    match: {
      id: row.id,
      ticket_no: row.ticket_no,
      title: row.title,
      summary: row.summary,
      status: row.status,
      photo_url: row.photo_url,
      building: row.building,
      floor: row.floor,
      spot: row.spot,
      created_at: row.created_at,
      similarity: best.similarity,
      reason: best.reason,
      is_own: row.reporter_id === userId,
      already_following: !!follow,
    },
  };
}
