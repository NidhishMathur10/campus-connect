import "server-only";
import { LF_MATCH_THRESHOLD, LF_MATCH_WINDOW_DAYS } from "@/config/lost-found";
import { scoreMatches } from "@/lib/ai/lost-found";
import { notifyLfMatches, type MatchPair } from "@/lib/email/lost-found-notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import type { LostFoundItem } from "./types";

export type Actor = Pick<Profile, "id" | "full_name" | "roll_no">;

/** Audit trail: who did what, with roll numbers. Never throws. */
export async function logLf(actor: Actor | null, itemId: string, action: string, detail?: string | null, claimId?: string | null) {
  const { error } = await createAdminClient()
    .from("lost_found_log")
    .insert({
      item_id: itemId,
      claim_id: claimId ?? null,
      actor_id: actor?.id ?? null,
      actor_name: actor?.full_name ?? "CampusConnect AI",
      actor_roll_no: actor?.roll_no ?? null,
      action,
      detail: detail?.slice(0, 500) ?? null,
    });
  if (error) console.error("[lost-found] log", error.message);
}

/**
 * CLAUDE.md §20 matching. Compares a new item with OPEN items of the opposite type from the last
 * 14 days (pre-filtered by category, "Other" matches anything), lets Gemini score descriptions and
 * photos, saves every pair at or above the threshold as a suggestion and tells both people.
 * Returns the number of suggestions saved. Never throws.
 */
export async function runMatching(itemId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("lost_found_items").select("*").eq("id", itemId).maybeSingle();
    const item = data as LostFoundItem | null;
    if (!item || !["open", "matched"].includes(item.status)) return 0;

    const opposite = item.type === "lost" ? "found" : "lost";
    const since = new Date(Date.now() - LF_MATCH_WINDOW_DAYS * 86_400_000).toISOString();
    const { data: pool } = await admin
      .from("lost_found_items")
      .select("*")
      .eq("type", opposite)
      .in("status", ["open", "matched"])
      .gte("created_at", since)
      .neq("reporter_id", item.reporter_id)
      .order("created_at", { ascending: false })
      .limit(40);

    // Pre-filter by category ("Other" on either side could be anything), same category first.
    const sameCategory = (c: LostFoundItem) => c.item_category === item.item_category;
    const candidates = ((pool ?? []) as LostFoundItem[])
      .filter((c) => sameCategory(c) || c.item_category === "Other" || item.item_category === "Other")
      .sort((a, b) => Number(sameCategory(b)) - Number(sameCategory(a)));
    if (candidates.length === 0) return 0;

    // Never re-suggest a pair that already exists (including rejected ones).
    const col = item.type === "lost" ? "lost_id" : "found_id";
    const { data: existing } = await admin.from("lost_found_matches").select("lost_id, found_id").eq(col, item.id);
    const seen = new Set((existing ?? []).map((m) => (item.type === "lost" ? m.found_id : m.lost_id) as string));
    const fresh = candidates.filter((c) => !seen.has(c.id));
    if (fresh.length === 0) return 0;

    const scored = await scoreMatches(item, fresh);
    const hits = scored.filter((s) => s.score >= LF_MATCH_THRESHOLD);
    if (hits.length === 0) {
      await logLf(null, item.id, "match_check", `Compared with ${scored.length} item(s); no match at ${LF_MATCH_THRESHOLD}+`);
      return 0;
    }

    const rows = hits.map((h) => ({
      lost_id: item.type === "lost" ? item.id : h.candidate.id,
      found_id: item.type === "found" ? item.id : h.candidate.id,
      score: h.score,
      reason: h.reason || null,
      status: "suggested" as const,
    }));
    const { error } = await admin.from("lost_found_matches").upsert(rows, { onConflict: "lost_id,found_id", ignoreDuplicates: true });
    if (error) {
      console.error("[lost-found] save matches", error.message);
      return 0;
    }

    const pairs: MatchPair[] = hits.map((h) => ({
      lost: item.type === "lost" ? item : h.candidate,
      found: item.type === "found" ? item : h.candidate,
      score: h.score,
      reason: h.reason,
    }));
    await logLf(null, item.id, "match_suggested", pairs.map((p) => `${p.lost.item_no}↔${p.found.item_no} (${Math.round(p.score * 100)}%)`).join(", "));
    notifyLfMatches(pairs);
    return pairs.length;
  } catch (err) {
    console.error("[lost-found] matching", err instanceof Error ? err.message : err);
    return 0;
  }
}
