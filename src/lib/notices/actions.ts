"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defaultExpiry, posterRule, RESOLVED_VISIBLE_HOURS } from "@/config/notices";
import { getCurrentProfile } from "@/lib/auth";
import { notifyKnownIssueResolved, notifyNoticePublished } from "@/lib/email/notice-notify";
import { createAdminClient } from "@/lib/supabase/admin";
import { findKnownIssues } from "./queries";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/tickets/actions";
import type { Notice, Profile } from "@/lib/types";
import { knownIssueCategoryOk, NoticeInputSchema, sanitiseAudience, type NoticeInput } from "./input";

/**
 * Notice board writes. Same pattern as the other modules: the signed-in profile is checked here, writes use
 * the service role, and RLS in schema.sql is the safety net for direct API use.
 */

const BUCKET = "notice-attachments";

function refresh(id?: string) {
  for (const p of ["/notices", "/hostel", "/hostel/notices", "/education", "/education/notices", "/"]) revalidatePath(p);
  if (id) revalidatePath(`/notices/${id}`);
}

async function requirePoster(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && posterRule(profile.role) ? profile : null;
}

async function requireStudent(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile?.role === "student" ? profile : null;
}

async function log(noticeId: string, actor: Pick<Profile, "id" | "full_name">, action: string, detail?: string) {
  await createAdminClient().from("notice_log").insert({ notice_id: noticeId, actor_id: actor.id, actor_name: actor.full_name, action, detail: detail ?? null });
}

/** Validates the compose form against what this role may post; returns the row to save. */
function buildRow(profile: Profile, input: NoticeInput): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const rule = posterRule(profile.role);
  if (!rule) return { ok: false, error: "You can't post notices." };
  if (!rule.modules.includes(input.module)) return { ok: false, error: "You can't post to that section." };
  if (!rule.types.includes(input.type)) return { ok: false, error: "You can't post that type of notice." };

  const isKnown = input.type === "known_issue";
  if (isKnown && !knownIssueCategoryOk(input.module, input.category)) {
    return { ok: false, error: "Pick the category this known issue is about." };
  }
  const eventAt = input.event_at ? new Date(input.event_at) : null;
  if (input.type === "event" && (!eventAt || Number.isNaN(eventAt.getTime()))) return { ok: false, error: "Add the event date and time." };
  const fixAt = input.expected_fix_at ? new Date(input.expected_fix_at) : null;
  if (fixAt && Number.isNaN(fixAt.getTime())) return { ok: false, error: "That expected fix time isn't valid." };
  let expires = input.expires_at ? new Date(input.expires_at) : defaultExpiry(input.type, eventAt);
  if (Number.isNaN(expires.getTime())) expires = defaultExpiry(input.type, eventAt);
  if (expires.getTime() <= Date.now()) return { ok: false, error: "The expiry time is already in the past." };

  const audience = sanitiseAudience(rule, input.audience, profile.subjects ?? []);
  return {
    ok: true,
    row: {
      module: input.module,
      type: input.type,
      title: input.title,
      title_hi: input.title_hi?.trim() || null,
      body: input.body,
      body_hi: input.body_hi?.trim() || null,
      summary: input.summary?.trim() || null,
      category: isKnown ? input.category : null,
      audience,
      event_at: input.type === "event" ? eventAt!.toISOString() : null,
      expected_fix_at: isKnown && fixAt ? fixAt.toISOString() : null,
      pinned: input.pinned,
      expires_at: expires.toISOString(),
    },
  };
}

/** Public URL of an attachment the poster uploaded into their own folder (anything else is ignored). */
function attachmentUrl(profile: Profile, path: string | null | undefined): string | null | undefined {
  if (path === undefined) return undefined;
  if (path === null) return null;
  if (!path.startsWith(`${profile.id}/`) || path.includes("..")) return null;
  return createAdminClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function publishNotice(raw: NoticeInput): Promise<ActionResult<{ id: string }>> {
  const profile = await requirePoster();
  if (!profile) return { ok: false, error: "Please log in again." };
  const parsed = NoticeInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const built = buildRow(profile, parsed.data);
  if (!built.ok) return built;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notices")
    .insert({
      ...built.row,
      author_id: profile.id,
      author_name: profile.full_name,
      author_role: profile.role,
      attachment_url: attachmentUrl(profile, parsed.data.attachment_path) ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[notices] publish", error?.message);
    return { ok: false, error: "Could not publish the notice. Please try again." };
  }
  const notice = data as Notice;
  await log(notice.id, profile, "posted", `${notice.type} · ${notice.title}`);
  notifyNoticePublished(notice);
  refresh(notice.id);
  return { ok: true, id: notice.id };
}

/** The author (or the Dean) may change a notice; people already notified are not notified again. */
async function loadEditable(profile: Profile, id: string): Promise<Notice | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient().from("notices").select("*").eq("id", id).maybeSingle();
  const n = (data as Notice | null) ?? null;
  if (!n) return null;
  return n.author_id === profile.id || profile.role === "dean" ? n : null;
}

export async function updateNotice(id: string, raw: NoticeInput): Promise<ActionResult> {
  const profile = await requirePoster();
  if (!profile) return { ok: false, error: "Please log in again." };
  const existing = await loadEditable(profile, id);
  if (!existing) return { ok: false, error: "That notice no longer exists." };
  const parsed = NoticeInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  // The Dean editing someone else's notice keeps the author's own rules out of it: judge by the notice's author role.
  const built = buildRow(existing.author_id === profile.id ? profile : { ...profile, role: "dean" }, parsed.data);
  if (!built.ok) return built;

  const attachment = attachmentUrl(profile, parsed.data.attachment_path);
  const patch: Record<string, unknown> = { ...built.row };
  if (attachment !== undefined) patch.attachment_url = attachment;
  const { error } = await createAdminClient().from("notices").update(patch).eq("id", id);
  if (error) return { ok: false, error: "Could not save your changes." };
  if (attachment !== undefined) await removeFile(existing.attachment_url);
  await log(id, profile, "edited", parsed.data.title);
  refresh(id);
  return { ok: true };
}

export async function resolveNotice(id: string, note?: string): Promise<ActionResult> {
  const profile = await requirePoster();
  if (!profile) return { ok: false, error: "Please log in again." };
  const n = await loadEditable(profile, id);
  if (!n || n.type !== "known_issue") return { ok: false, error: "That known issue no longer exists." };
  if (n.status === "resolved") return { ok: true };

  const admin = createAdminClient();
  const resolvedNote = note?.trim().slice(0, 500) || null;
  // Guarded update: only the first click wins, so followers are told exactly once.
  const { data, error } = await admin
    .from("notices")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
      resolution_note: resolvedNote,
      expires_at: new Date(Date.now() + RESOLVED_VISIBLE_HOURS * 3_600_000).toISOString(),
      pinned: false,
    })
    .eq("id", id)
    .eq("status", "active")
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: "Could not mark it resolved." };
  if (!data) return { ok: true };

  const { data: followers } = await admin.from("notice_followers").select("user_id").eq("notice_id", id);
  const followerIds = (followers ?? []).map((f) => f.user_id as string);
  await log(id, profile, "resolved", `${followerIds.length} follower${followerIds.length === 1 ? "" : "s"} notified${resolvedNote ? ` · ${resolvedNote}` : ""}`);
  notifyKnownIssueResolved(data as Notice, followerIds, resolvedNote);
  refresh(id);
  return { ok: true };
}

async function removeFile(url: string | null | undefined) {
  const marker = `/${BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  if (!url || i < 0) return;
  await createAdminClient().storage.from(BUCKET).remove([decodeURIComponent(url.slice(i + marker.length))]);
}

export async function deleteNotice(id: string): Promise<ActionResult> {
  const profile = await requirePoster();
  if (!profile) return { ok: false, error: "Please log in again." };
  const n = await loadEditable(profile, id);
  if (!n) return { ok: false, error: "That notice no longer exists." };
  const { error } = await createAdminClient().from("notices").delete().eq("id", id);
  if (error) return { ok: false, error: "Could not delete the notice." };
  await removeFile(n.attachment_url);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

/** A notice only counts if RLS lets this student see it. */
async function canSee(id: string): Promise<Notice | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("notices").select("*").eq("id", id).maybeSingle();
  return (data as Notice | null) ?? null;
}

/** "Seen by N of M": opened notices are recorded once; an earlier "Got it" is never undone. */
export async function markNoticesSeen(ids: string[]): Promise<void> {
  const profile = await requireStudent();
  if (!profile) return;
  const valid = ids.filter((id) => z.uuid().safeParse(id).success).slice(0, 50);
  if (valid.length === 0) return;
  const supabase = await createClient();
  const { data: visible } = await supabase.from("notices").select("id").in("id", valid);
  const rows = (visible ?? []).map((n) => ({ notice_id: n.id as string, user_id: profile.id }));
  if (rows.length === 0) return;
  await createAdminClient().from("notice_reads").upsert(rows, { onConflict: "notice_id,user_id", ignoreDuplicates: true });
}

export async function acknowledgeNotice(id: string): Promise<ActionResult> {
  const profile = await requireStudent();
  if (!profile) return { ok: false, error: "Please log in again." };
  const n = await canSee(id);
  if (!n) return { ok: false, error: "That notice is no longer available." };
  const { error } = await createAdminClient()
    .from("notice_reads")
    .upsert({ notice_id: id, user_id: profile.id, acknowledged: true }, { onConflict: "notice_id,user_id" });
  if (error) return { ok: false, error: "Could not save that. Please try again." };
  refresh();
  return { ok: true };
}

/** "Me too (follow updates)" on a known issue, from the complaint preview or the notice itself. */
export async function followKnownIssue(id: string): Promise<ActionResult<{ followers: number }>> {
  const profile = await requireStudent();
  if (!profile) return { ok: false, error: "Please log in again." };
  const n = await canSee(id);
  if (!n || n.type !== "known_issue" || n.status !== "active") return { ok: false, error: "That known issue is no longer active." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("notice_followers")
    .upsert({ notice_id: id, user_id: profile.id }, { onConflict: "notice_id,user_id", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Could not follow this issue. Please try again." };
  await admin.from("notice_reads").upsert({ notice_id: id, user_id: profile.id }, { onConflict: "notice_id,user_id", ignoreDuplicates: true });
  await log(id, profile, "me_too", `${profile.roll_no ?? profile.full_name} follows this known issue`);
  const { count } = await admin.from("notice_followers").select("user_id", { count: "exact", head: true }).eq("notice_id", id);
  refresh(id);
  return { ok: true, followers: count ?? 1 };
}

export async function findKnownIssuesAction(q: {
  module: "hostel" | "academic";
  category: string;
  building: string | null;
  floor: string | null;
}) {
  const profile = await requireStudent();
  if (!profile) return [];
  return findKnownIssues(profile, q);
}
