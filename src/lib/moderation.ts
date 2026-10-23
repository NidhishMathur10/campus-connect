import "server-only";
import { MODERATION_FLAG, type ModerationResult } from "@/config/moderation";
import type { TicketModule } from "@/config/routing";
import { PHOTO_BUCKET } from "@/config/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

/** Deletes a rejected photo from storage. Best effort: never throws. */
export async function deleteStoredPhoto(path: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(PHOTO_BUCKET).remove([path]);
  if (error) console.error("[moderation] could not delete photo", error.message);
}

/**
 * Records every non-"allow" outcome (rephrase / privacy / block). Best effort: logging must never
 * get in the way of the student's complaint. Only the reason is stored, never the complaint text.
 */
export async function logModeration(
  profile: Pick<Profile, "id" | "roll_no">,
  module: TicketModule | "lost_found",
  moderation: ModerationResult,
): Promise<void> {
  const rows: { kind: "text" | "photo"; level: string; reason: string }[] = [];
  if (moderation.text.level !== "allow") rows.push({ kind: "text", level: moderation.text.level, reason: moderation.text.reason });
  if (moderation.photo && moderation.photo.level !== "allow") {
    rows.push({ kind: "photo", level: moderation.photo.level, reason: moderation.photo.reason });
  }
  if (rows.length === 0) return;
  const { error } = await createAdminClient()
    .from("moderation_log")
    .insert(rows.map((r) => ({ ...r, user_id: profile.id, roll_no: profile.roll_no, module, reason: r.reason.slice(0, 300) })));
  if (error) console.error("[moderation] could not write moderation_log", error.message);
}

export interface ModerationFlag {
  user_id: string;
  /** Roll number for students, name for faculty. */
  who: string;
  blocks: number;
  last_at: string;
}

/** People with {MODERATION_FLAG.blocks}+ blocked submissions in the last {MODERATION_FLAG.hours} hours (warden dashboard). */
export async function listModerationFlags(): Promise<ModerationFlag[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - MODERATION_FLAG.hours * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("moderation_log")
    .select("user_id, roll_no, created_at")
    .eq("level", "block")
    .gte("created_at", since);
  if (error) {
    console.error("[moderation] flags", error.message);
    return [];
  }
  const byUser = new Map<string, ModerationFlag>();
  for (const r of data ?? []) {
    const cur = byUser.get(r.user_id) ?? { user_id: r.user_id, who: r.roll_no ?? "", blocks: 0, last_at: r.created_at };
    cur.blocks += 1;
    if (r.created_at > cur.last_at) cur.last_at = r.created_at;
    byUser.set(r.user_id, cur);
  }
  const flagged = [...byUser.values()].filter((f) => f.blocks >= MODERATION_FLAG.blocks);
  const noRoll = flagged.filter((f) => !f.who);
  if (noRoll.length) {
    const { data: people } = await admin.from("profiles").select("id, full_name").in("id", noRoll.map((f) => f.user_id));
    const names = new Map((people ?? []).map((p) => [p.id, p.full_name as string]));
    for (const f of noRoll) f.who = names.get(f.user_id) ?? "Unknown";
  }
  return flagged.sort((a, b) => b.blocks - a.blocks || b.last_at.localeCompare(a.last_at));
}
