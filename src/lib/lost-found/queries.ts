import "server-only";
import { isLfManager, isLfStaff, LF_EXPIRY_DAYS, LF_EXPIRY_WARN_DAYS, LF_REPORTER_ROLES } from "@/config/lost-found";
import type { Role } from "@/config/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LostFoundClaim, LostFoundItem, LostFoundMatch, PublicItem } from "./types";

/**
 * Reads for Lost & Found. The service role is used on purpose: students may not read other
 * people's rows (RLS), so everything they see is built here, sanitised by `toPublic`.
 * Names and roll numbers are only ever attached for the Security Office / warden (desk + detail).
 */

export interface Viewer {
  id: string;
  role: Role;
}

const DAY = 86_400_000;

/** Statuses that appear on the public Lost / Found boards. */
const BOARD_STATUSES = ["open", "matched", "claimed"];

/** Sanitised view of a row for this viewer (see PublicItem). */
export function toPublic(row: LostFoundItem, viewer: Viewer): PublicItem {
  const mine = row.reporter_id === viewer.id;
  const privileged = mine || isLfStaff(viewer.role);
  const hideDetails = row.sensitive && !privileged;
  const blurred = !!row.photo_path && hideDetails;
  return {
    id: row.id,
    item_no: row.item_no,
    type: row.type,
    title: row.title,
    // Others read the AI-cleaned description, never the raw text (it may hold names or numbers).
    description: privileged ? row.description : (row.public_description || row.title),
    item_category: row.item_category,
    color: row.color,
    brand: hideDetails ? null : row.brand,
    marks: hideDetails ? null : row.marks,
    sensitive: row.sensitive,
    building: row.building,
    spot: row.spot,
    happened_at: row.happened_at,
    photo_src: !row.photo_path ? null : blurred ? `/api/lost-found/photo/${row.id}` : row.photo_url,
    photo_blurred: blurred,
    status: row.status,
    held_at: row.held_at,
    created_at: row.created_at,
    is_mine: mine,
  };
}

async function itemsByIds(ids: string[]): Promise<Map<string, LostFoundItem>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient().from("lost_found_items").select("*").in("id", unique);
  return new Map(((data ?? []) as LostFoundItem[]).map((i) => [i.id, i]));
}

export interface PersonRef {
  name: string;
  roll_no: string | null;
}

/** Name + roll number lookups. Only call from staff-only paths. */
async function peopleRefs(ids: string[]): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, full_name, roll_no").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, { name: p.full_name as string, roll_no: (p.roll_no as string | null) ?? null }]));
}

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------
export interface MyClaimSummary {
  claim: LostFoundClaim;
  item: PublicItem;
  /** Shown once the claim is approved. */
  pickup_note: string | null;
}

export interface BoardData {
  items: PublicItem[];
  mine: PublicItem[];
  myClaims: MyClaimSummary[];
  /** Found items with a suggested match against one of my lost items: found item id -> score. */
  matchedForMe: Record<string, number>;
}

export async function loadBoard(viewer: Viewer): Promise<BoardData> {
  const admin = createAdminClient();
  const [open, mine, claims, myLost] = await Promise.all([
    admin
      .from("lost_found_items")
      .select("*")
      .in("status", BOARD_STATUSES)
      .order("created_at", { ascending: false })
      .limit(300),
    admin.from("lost_found_items").select("*").eq("reporter_id", viewer.id).order("created_at", { ascending: false }).limit(100),
    admin.from("lost_found_claims").select("*").eq("claimant_id", viewer.id).order("created_at", { ascending: false }).limit(50),
    admin.from("lost_found_items").select("id").eq("reporter_id", viewer.id).eq("type", "lost"),
  ]);

  const claimRows = (claims.data ?? []) as LostFoundClaim[];
  const claimItems = await itemsByIds(claimRows.map((c) => c.item_id));

  const lostIds = (myLost.data ?? []).map((r) => r.id as string);
  const matchedForMe: Record<string, number> = {};
  if (lostIds.length > 0) {
    const { data: ms } = await admin
      .from("lost_found_matches")
      .select("found_id, score")
      .in("lost_id", lostIds)
      .neq("status", "rejected");
    for (const m of ms ?? []) matchedForMe[m.found_id as string] = Math.max(matchedForMe[m.found_id as string] ?? 0, m.score as number);
  }

  return {
    items: ((open.data ?? []) as LostFoundItem[]).map((r) => toPublic(r, viewer)),
    mine: ((mine.data ?? []) as LostFoundItem[]).map((r) => toPublic(r, viewer)),
    myClaims: claimRows.flatMap((claim) => {
      const row = claimItems.get(claim.item_id);
      return row ? [{ claim, item: toPublic(row, viewer), pickup_note: claim.status === "approved" ? row.pickup_note : null }] : [];
    }),
    matchedForMe,
  };
}

// ---------------------------------------------------------------------------
// Item detail
// ---------------------------------------------------------------------------
export interface DetailMatch {
  match: LostFoundMatch;
  /** The other side of the pair, sanitised for this viewer. */
  other: PublicItem;
}

export interface DetailClaim {
  claim: LostFoundClaim;
  claimant: PersonRef | null;
}

export interface ItemDetail {
  item: PublicItem;
  viewerIsMine: boolean;
  viewerIsStaff: boolean;
  viewerIsManager: boolean;
  /** The found item's verification question, for people who may claim it (and staff / the finder). */
  verification_question: string | null;
  /** Only the finder and staff ever see the expected answer. */
  verification_answer: string | null;
  /** The viewer can press "This is mine". */
  canClaim: boolean;
  /** The viewer's own lost report that has a suggested match with this found item. */
  linkedLostId: string | null;
  /** Match score between that lost report and this item. */
  linkedScore: number | null;
  myClaim: LostFoundClaim | null;
  pickup_note: string | null;
  matches: DetailMatch[];
  /** Staff only: who reported it and every claim, with roll numbers. */
  reporter: PersonRef | null;
  claims: DetailClaim[];
  photoAnalysis: LostFoundItem["photo_analysis"];
}

export async function loadItemDetail(id: string, viewer: Viewer): Promise<ItemDetail | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("lost_found_items").select("*").eq("id", id).maybeSingle();
  const row = data as LostFoundItem | null;
  if (!row) return null;

  const staff = isLfStaff(viewer.role);
  const mine = row.reporter_id === viewer.id;

  const { data: myClaimRows } = await admin
    .from("lost_found_claims")
    .select("*")
    .eq("item_id", id)
    .eq("claimant_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const myClaim = ((myClaimRows ?? [])[0] as LostFoundClaim | undefined) ?? null;

  // Closed items are only visible to the people involved.
  const closed = row.status === "returned" || row.status === "expired";
  if (closed && !mine && !staff && !myClaim) return null;

  // Matches this viewer may see: their own side of the pair (staff: all).
  const { data: matchRows } = await admin
    .from("lost_found_matches")
    .select("*")
    .or(`lost_id.eq.${id},found_id.eq.${id}`)
    .neq("status", "rejected");
  const allMatches = (matchRows ?? []) as LostFoundMatch[];
  const otherIds = allMatches.map((m) => (m.lost_id === id ? m.found_id : m.lost_id));
  const others = await itemsByIds(otherIds);

  const viewable = allMatches.filter((m) => {
    const other = others.get(m.lost_id === id ? m.found_id : m.lost_id);
    if (!other) return false;
    if (staff) return true;
    // Reporters see matches on their own item. A found item's page also shows the viewer's own matching lost report.
    return mine || other.reporter_id === viewer.id;
  });
  const matches: DetailMatch[] = viewable.flatMap((m) => {
    const other = others.get(m.lost_id === id ? m.found_id : m.lost_id);
    return other ? [{ match: m, other: toPublic(other, viewer) }] : [];
  });

  // A found item's page: which of MY lost reports matches it (pre-fills the claim).
  let linkedLostId: string | null = null;
  let linkedScore: number | null = null;
  if (row.type === "found" && !mine) {
    const own = viewable
      .filter((m) => others.get(m.lost_id)?.reporter_id === viewer.id)
      .sort((a, b) => b.score - a.score)[0];
    if (own) {
      linkedLostId = own.lost_id;
      linkedScore = own.score;
    }
  }

  const canClaim =
    row.type === "found" &&
    !mine &&
    LF_REPORTER_ROLES.includes(viewer.role) &&
    (row.status === "open" || row.status === "matched") &&
    myClaim?.status !== "pending";

  const approvedForMe = myClaim?.status === "approved";
  const seesQuestion = row.type === "found" && !!row.verification_question && (canClaim || mine || staff || !!myClaim);

  let reporter: PersonRef | null = null;
  let claims: DetailClaim[] = [];
  if (staff) {
    const { data: claimRows } = await admin.from("lost_found_claims").select("*").eq("item_id", id).order("created_at", { ascending: false });
    const list = (claimRows ?? []) as LostFoundClaim[];
    const refs = await peopleRefs([row.reporter_id, ...list.map((c) => c.claimant_id)]);
    reporter = refs.get(row.reporter_id) ?? null;
    claims = list.map((claim) => ({ claim, claimant: refs.get(claim.claimant_id) ?? null }));
  }

  return {
    item: toPublic(row, viewer),
    viewerIsMine: mine,
    viewerIsStaff: staff,
    viewerIsManager: isLfManager(viewer.role),
    verification_question: seesQuestion ? row.verification_question : null,
    verification_answer: mine || staff ? row.verification_answer : null,
    canClaim,
    linkedLostId,
    linkedScore,
    myClaim,
    pickup_note: row.pickup_note && (staff || mine || approvedForMe) ? row.pickup_note : null,
    matches,
    reporter,
    claims,
    photoAnalysis: mine || staff ? row.photo_analysis : null,
  };
}

// ---------------------------------------------------------------------------
// Security Officer desk
// ---------------------------------------------------------------------------
export interface DeskItem extends PublicItem {
  reporter: PersonRef | null;
  verification_question: string | null;
  verification_answer: string | null;
  pickup_note: string | null;
  /** Days since it was listed. */
  age_days: number;
  /** Approved claimant (for the handover), when the item is claimed. */
  claimant: PersonRef | null;
}

export interface DeskClaim {
  claim: LostFoundClaim;
  claimant: PersonRef | null;
  found: DeskItem;
  /** The claimant's own lost report, if they linked one. */
  lost: DeskItem | null;
}

export interface DeskMatch {
  match: LostFoundMatch;
  lost: DeskItem;
  found: DeskItem;
}

export interface DeskLogEntry {
  id: string;
  item_no: string | null;
  actor_name: string | null;
  actor_roll_no: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface DeskData {
  /** Found items physically at the Security Office (open / matched / claimed awaiting handover). */
  held: DeskItem[];
  /** Found items a finder is still holding. */
  withFinder: DeskItem[];
  claims: DeskClaim[];
  matches: DeskMatch[];
  /** Found items 25+ days old that nobody collected. `overdue` = 30+ days. */
  expiry: DeskItem[];
  log: DeskLogEntry[];
}

export async function loadDesk(viewer: Viewer): Promise<DeskData> {
  const admin = createAdminClient();
  const [foundRes, claimRes, matchRes, logRes] = await Promise.all([
    admin
      .from("lost_found_items")
      .select("*")
      .eq("type", "found")
      .in("status", ["open", "matched", "claimed"])
      .order("created_at", { ascending: true })
      .limit(200),
    admin.from("lost_found_claims").select("*").order("created_at", { ascending: false }).limit(200),
    admin.from("lost_found_matches").select("*").eq("status", "suggested").order("score", { ascending: false }).limit(50),
    admin.from("lost_found_log").select("id, item_id, actor_name, actor_roll_no, action, detail, created_at").order("created_at", { ascending: false }).limit(40),
  ]);

  const found = (foundRes.data ?? []) as LostFoundItem[];
  const claims = (claimRes.data ?? []) as LostFoundClaim[];
  const matches = (matchRes.data ?? []) as LostFoundMatch[];
  const logs = (logRes.data ?? []) as (Omit<DeskLogEntry, "item_no"> & { item_id: string | null })[];

  const pendingClaims = claims.filter((c) => c.status === "pending");
  const approvedByItem = new Map(claims.filter((c) => c.status === "approved").map((c) => [c.item_id, c]));

  const extraIds = [
    ...pendingClaims.flatMap((c) => [c.item_id, c.lost_id ?? ""]),
    ...matches.flatMap((m) => [m.lost_id, m.found_id]),
    ...logs.map((l) => l.item_id ?? ""),
  ].filter(Boolean);
  const itemMap = await itemsByIds([...found.map((f) => f.id), ...extraIds]);

  const refs = await peopleRefs([
    ...[...itemMap.values()].map((i) => i.reporter_id),
    ...pendingClaims.map((c) => c.claimant_id),
    ...[...approvedByItem.values()].map((c) => c.claimant_id),
  ]);

  const desk = (row: LostFoundItem): DeskItem => ({
    ...toPublic(row, viewer),
    reporter: refs.get(row.reporter_id) ?? null,
    verification_question: row.verification_question,
    verification_answer: row.verification_answer,
    pickup_note: row.pickup_note,
    age_days: Math.floor((Date.now() - new Date(row.created_at).getTime()) / DAY),
    claimant: row.status === "claimed" || row.status === "returned" ? (refs.get(approvedByItem.get(row.id)?.claimant_id ?? "") ?? null) : null,
  });

  const foundDesk = found.map(desk);
  const deskItem = (id: string | null) => {
    const row = id ? itemMap.get(id) : null;
    return row ? desk(row) : null;
  };

  return {
    held: foundDesk.filter((i) => i.held_at !== "with_finder"),
    withFinder: foundDesk.filter((i) => i.held_at === "with_finder"),
    claims: pendingClaims.flatMap((claim) => {
      const f = deskItem(claim.item_id);
      return f ? [{ claim, claimant: refs.get(claim.claimant_id) ?? null, found: f, lost: deskItem(claim.lost_id) }] : [];
    }),
    matches: matches.flatMap((match) => {
      const lost = deskItem(match.lost_id);
      const f = deskItem(match.found_id);
      return lost && f ? [{ match, lost, found: f }] : [];
    }),
    expiry: foundDesk.filter((i) => i.status !== "claimed" && i.age_days >= LF_EXPIRY_DAYS - LF_EXPIRY_WARN_DAYS).sort((a, b) => b.age_days - a.age_days),
    log: logs.map((l) => ({
      id: l.id,
      item_no: l.item_id ? (itemMap.get(l.item_id)?.item_no ?? null) : null,
      actor_name: l.actor_name,
      actor_roll_no: l.actor_roll_no,
      action: l.action,
      detail: l.detail,
      created_at: l.created_at,
    })),
  };
}
