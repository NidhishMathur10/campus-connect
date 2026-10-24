import "server-only";
import { modulesForPage, knownIssueCoversPlace, type NoticeModule } from "@/config/notices";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Notice, Profile } from "@/lib/types";

/**
 * Notice board reads. Student reads go through the signed-in user's own client, so RLS
 * (`notice_visible()` in schema.sql) is what decides who sees which notice; poster statistics
 * (read counts, audience size) need the service role.
 */

export type NoticePage = "hostel" | "academic";

export interface NoticeView extends Notice {
  seen: boolean;
  acknowledged: boolean;
  /** Known issues: this student tapped "Me too". */
  following: boolean;
}

export interface NoticeStats {
  seen: number;
  acknowledged: number;
  /** Students the audience covers. */
  audience: number;
  followers: number;
}

const nowIso = () => new Date().toISOString();

/** Marks overdue notices as expired. Cheap and idempotent; runs whenever a notice list loads. */
export async function sweepExpiredNotices(): Promise<void> {
  try {
    await createAdminClient().from("notices").update({ status: "expired" }).eq("status", "active").lt("expires_at", nowIso());
  } catch (err) {
    console.error("[notices] sweep", err instanceof Error ? err.message : err);
  }
}

async function readState(userId: string, ids: string[]) {
  const reads = new Map<string, boolean>();
  const following = new Set<string>();
  if (ids.length === 0) return { reads, following };
  const supabase = await createClient();
  const [r, f] = await Promise.all([
    supabase.from("notice_reads").select("notice_id, acknowledged").eq("user_id", userId).in("notice_id", ids),
    supabase.from("notice_followers").select("notice_id").eq("user_id", userId).in("notice_id", ids),
  ]);
  for (const row of r.data ?? []) reads.set(row.notice_id as string, !!row.acknowledged);
  for (const row of f.data ?? []) following.add(row.notice_id as string);
  return { reads, following };
}

/** Everything a student may see on a module page (that module + "all" + safety), pinned first. */
export async function listNoticesForStudent(profile: Pick<Profile, "id">, page?: NoticePage): Promise<NoticeView[]> {
  await sweepExpiredNotices();
  const supabase = await createClient();
  let q = supabase
    .from("notices")
    .select("*")
    .in("status", ["active", "resolved"])
    .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  if (page) q = q.in("module", modulesForPage(page));
  const { data } = await q;
  const notices = (data ?? []) as Notice[];
  const { reads, following } = await readState(profile.id, notices.map((n) => n.id));
  return notices.map((n) => ({ ...n, seen: reads.has(n.id), acknowledged: reads.get(n.id) === true, following: following.has(n.id) }));
}

/** Active notices this student has not opened yet (badge on the Notices link). */
export async function unreadNoticeCount(profile: Pick<Profile, "id">, page?: NoticePage): Promise<number> {
  const supabase = await createClient();
  let q = supabase
    .from("notices")
    .select("id")
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
    .limit(200);
  if (page) q = q.in("module", modulesForPage(page));
  const { data } = await q;
  const ids = (data ?? []).map((n) => n.id as string);
  if (ids.length === 0) return 0;
  const { reads } = await readState(profile.id, ids);
  return ids.filter((id) => !reads.has(id)).length;
}

/** Urgent alerts the student has not acknowledged yet (red banner). */
export async function pendingUrgentNotices(profile: Pick<Profile, "id">, page?: NoticePage): Promise<Notice[]> {
  const supabase = await createClient();
  let q = supabase
    .from("notices")
    .select("*")
    .eq("type", "urgent")
    .eq("status", "active")
    .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (page) q = q.in("module", modulesForPage(page));
  const { data } = await q;
  const notices = (data ?? []) as Notice[];
  const { reads } = await readState(profile.id, notices.map((n) => n.id));
  return notices.filter((n) => reads.get(n.id) !== true);
}

// ---------------------------------------------------------------------------
// Known issues <-> complaints
// ---------------------------------------------------------------------------
export interface KnownIssueMatch {
  id: string;
  title: string;
  title_hi: string | null;
  summary: string | null;
  expected_fix_at: string | null;
  following: boolean;
}

/** Active known issues for this module + category that cover the place being reported from. */
export async function findKnownIssues(
  profile: Pick<Profile, "id">,
  q: { module: "hostel" | "academic"; category: string; building: string | null; floor: string | null },
): Promise<KnownIssueMatch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notices")
    .select("*")
    .eq("type", "known_issue")
    .eq("status", "active")
    .eq("module", q.module)
    .eq("category", q.category)
    .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
    .order("created_at", { ascending: false })
    .limit(5);
  const covering = ((data ?? []) as Notice[]).filter((n) => knownIssueCoversPlace(n.audience, q));
  const { following } = await readState(profile.id, covering.map((n) => n.id));
  return covering.map((n) => ({
    id: n.id,
    title: n.title,
    title_hi: n.title_hi,
    summary: n.summary,
    expected_fix_at: n.expected_fix_at,
    following: following.has(n.id),
  }));
}

// ---------------------------------------------------------------------------
// Poster side
// ---------------------------------------------------------------------------
export async function noticeStats(notices: Pick<Notice, "id" | "audience">[]): Promise<Map<string, NoticeStats>> {
  const out = new Map<string, NoticeStats>();
  if (notices.length === 0) return out;
  const admin = createAdminClient();
  const ids = notices.map((n) => n.id);
  const [reads, followers] = await Promise.all([
    admin.from("notice_reads").select("notice_id, acknowledged").in("notice_id", ids),
    admin.from("notice_followers").select("notice_id").in("notice_id", ids),
  ]);
  const sizes = await Promise.all(
    notices.map(async (n) => {
      const { data } = await admin.rpc("notice_audience_size", { p_audience: n.audience ?? { all: true } });
      return typeof data === "number" ? data : 0;
    }),
  );
  notices.forEach((n, i) => out.set(n.id, { seen: 0, acknowledged: 0, audience: sizes[i], followers: 0 }));
  for (const r of reads.data ?? []) {
    const s = out.get(r.notice_id as string);
    if (s) {
      s.seen += 1;
      if (r.acknowledged) s.acknowledged += 1;
    }
  }
  for (const f of followers.data ?? []) {
    const s = out.get(f.notice_id as string);
    if (s) s.followers += 1;
  }
  return out;
}

/** Notices a poster may open: their own, plus everything their role administers (RLS decides). */
export async function listNoticesForPoster(): Promise<Notice[]> {
  await sweepExpiredNotices();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as Notice[];
}

export async function getNoticeForPoster(id: string): Promise<Notice | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("notices").select("*").eq("id", id).maybeSingle();
  return (data as Notice | null) ?? null;
}

/** Recent activity on a notice (posted / edited / resolved / "Me too"). */
export async function noticeLog(id: string) {
  const { data } = await createAdminClient()
    .from("notice_log")
    .select("id, actor_name, action, detail, created_at")
    .eq("notice_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as { id: string; actor_name: string; action: string; detail: string | null; created_at: string }[];
}

export type { NoticeModule };
