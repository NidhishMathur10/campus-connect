"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  isLfManager,
  LF_CATEGORIES,
  LF_DEFAULT_PICKUP,
  LF_DISPOSITIONS,
  LF_HELD_AT,
  LF_REPORTER_ROLES,
  LF_SENSITIVE_CATEGORIES,
  LF_TYPES,
} from "@/config/lost-found";
import { getCurrentProfile } from "@/lib/auth";
import {
  notifyLfClaimDecision,
  notifyLfClaimSubmitted,
  notifyLfHandoverRequest,
  notifyLfMatchConfirmed,
  notifyLfReturned,
} from "@/lib/email/lost-found-notify";
import { inBackground } from "@/lib/email/send";
import { photoPublicUrl } from "@/lib/photos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/tickets/actions";
import type { Profile } from "@/lib/types";
import { logLf, runMatching } from "./core";
import { scrubNumbers } from "./text";
import type { LostFoundClaim, LostFoundItem } from "./types";

/**
 * Lost & Found writes. Same pattern as tickets: the signed-in profile is checked here, writes use the
 * service role, RLS in schema.sql is the safety net for direct API use.
 */

function refresh(id?: string) {
  revalidatePath("/lost-found");
  revalidatePath("/lost-found/desk");
  if (id) revalidatePath(`/lost-found/${id}`);
}

async function requireReporter(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && LF_REPORTER_ROLES.includes(profile.role) ? profile : null;
}

async function requireManager(): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && isLfManager(profile.role) ? profile : null;
}

async function loadItem(id: string): Promise<LostFoundItem | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await createAdminClient().from("lost_found_items").select("*").eq("id", id).maybeSingle();
  return (data as LostFoundItem | null) ?? null;
}

/** Roll number (or name) of a claimant, for audit entries. */
async function whoIs(userId: string): Promise<string> {
  const { data } = await createAdminClient().from("profiles").select("full_name, roll_no").eq("id", userId).maybeSingle();
  return data?.roll_no ? `roll ${data.roll_no}` : (data?.full_name ?? "unknown");
}

// ---------------------------------------------------------------------------
// Report a lost / found item
// ---------------------------------------------------------------------------
const short = (max: number) => z.string().trim().max(max).default("");

const CreateSchema = z.object({
  type: z.enum(LF_TYPES),
  title: z.string().trim().min(2, "Give the item a short title.").max(80),
  /** What the reporter wrote (private to them and the Security Office). */
  description: z.string().trim().min(3).max(1500),
  /** What everyone else reads. */
  publicDescription: short(400),
  itemCategory: z.enum(LF_CATEGORIES),
  color: short(60),
  brand: short(60),
  marks: short(200),
  sensitive: z.boolean(),
  building: z.string().trim().max(80).nullable(),
  spot: z.string().trim().max(120).nullable(),
  happenedAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Pick a valid date."),
  photoPath: z.string().max(300).nullable(),
  photoAnalysis: z.object({ observed: z.string(), matches_complaint: z.boolean(), notes: z.string() }).nullable(),
  heldAt: z.enum(LF_HELD_AT).nullable(),
  verificationQuestion: short(200),
  verificationAnswer: short(200),
  language: z.string().max(5).default("en"),
  aiModel: z.string().max(60).nullable(),
  moderation: z.enum(["passed", "unchecked"]),
});
export type CreateLostFoundInput = z.input<typeof CreateSchema>;

export async function createLostFoundItem(
  input: CreateLostFoundInput,
): Promise<ActionResult<{ id: string; item_no: string }>> {
  const profile = await requireReporter();
  if (!profile) return { ok: false, error: "Only students and faculty can post lost or found items. Please log in again." };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const d = parsed.data;

  if (d.type === "found" && !d.heldAt) return { ok: false, error: "Tell us where the item is now." };
  if (d.photoPath && !d.photoPath.startsWith(`${profile.id}/`)) return { ok: false, error: "That photo doesn't belong to you." };

  // A date in the future is a typo; clamp to now.
  const happened = Math.min(Date.parse(d.happenedAt), Date.now());
  const sensitive = d.sensitive || LF_SENSITIVE_CATEGORIES.includes(d.itemCategory);

  const { data, error } = await createAdminClient()
    .from("lost_found_items")
    .insert({
      type: d.type,
      reporter_id: profile.id,
      title: scrubNumbers(d.title) || d.title,
      description: d.description,
      public_description: scrubNumbers(d.publicDescription) || null,
      item_category: d.itemCategory,
      color: d.color || null,
      brand: d.brand || null,
      marks: d.marks || null,
      sensitive,
      building: d.building,
      spot: d.spot || null,
      happened_at: new Date(happened).toISOString(),
      photo_path: d.photoPath,
      photo_url: d.photoPath ? photoPublicUrl(d.photoPath) : null,
      photo_analysis: d.photoAnalysis,
      held_at: d.type === "found" ? d.heldAt : null,
      verification_question: d.type === "found" ? d.verificationQuestion || null : null,
      verification_answer: d.type === "found" ? d.verificationAnswer || null : null,
      language: d.language,
      ai_meta: { model: d.aiModel, moderation: d.moderation },
    })
    .select("id, item_no")
    .single();
  if (error || !data) {
    console.error("[createLostFoundItem]", error?.message);
    return { ok: false, error: "Could not save your post. Please try again." };
  }

  await logLf(profile, data.id, `${d.type}_reported`, `${data.item_no} · ${d.itemCategory}${sensitive ? " · sensitive" : ""}`);
  // Matching calls Gemini (descriptions + photos); it runs after the response.
  inBackground(() => runMatching(data.id));
  refresh();
  return { ok: true, id: data.id, item_no: data.item_no };
}

// ---------------------------------------------------------------------------
// Claim: "This is mine"
// ---------------------------------------------------------------------------
const ClaimSchema = z.object({
  itemId: z.uuid(),
  answer: z.string().trim().min(3, "Please answer the question (a few words is enough).").max(600),
});

export async function submitClaim(input: z.input<typeof ClaimSchema>): Promise<ActionResult<{ claim_id: string }>> {
  const profile = await requireReporter();
  if (!profile) return { ok: false, error: "Please log in again." };
  const parsed = ClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your answer." };

  const item = await loadItem(parsed.data.itemId);
  if (!item || item.type !== "found") return { ok: false, error: "That item isn't available." };
  if (item.reporter_id === profile.id) return { ok: false, error: "You reported this item, so you can't claim it." };
  if (item.status !== "open" && item.status !== "matched") return { ok: false, error: "This item is no longer open for claims." };

  const admin = createAdminClient();
  // The claimant's own lost report that was matched with this item (best score), if any.
  const { data: mine } = await admin.from("lost_found_items").select("id").eq("reporter_id", profile.id).eq("type", "lost");
  const myLostIds = (mine ?? []).map((r) => r.id as string);
  let lostId: string | null = null;
  let score: number | null = null;
  let reason: string | null = null;
  if (myLostIds.length > 0) {
    const { data: ms } = await admin
      .from("lost_found_matches")
      .select("lost_id, score, reason")
      .eq("found_id", item.id)
      .in("lost_id", myLostIds)
      .neq("status", "rejected")
      .order("score", { ascending: false })
      .limit(1);
    const best = ms?.[0];
    if (best) {
      lostId = best.lost_id as string;
      score = best.score as number;
      reason = (best.reason as string | null) ?? null;
    }
  }

  const { data, error } = await admin
    .from("lost_found_claims")
    .insert({ item_id: item.id, claimant_id: profile.id, lost_id: lostId, answer: parsed.data.answer, match_score: score, match_reason: reason })
    .select("id")
    .single();
  if (error || !data) {
    // The partial unique index allows only one pending claim per person per item.
    if (error?.code === "23505") return { ok: false, error: "You already have a claim waiting on this item." };
    console.error("[submitClaim]", error?.message);
    return { ok: false, error: "Could not send your claim. Please try again." };
  }

  await logLf(profile, item.id, "claim_submitted", `${item.item_no} claimed by roll ${profile.roll_no ?? profile.full_name}`, data.id);
  notifyLfClaimSubmitted(item);
  refresh(item.id);
  return { ok: true, claim_id: data.id };
}

// ---------------------------------------------------------------------------
// Security Officer: review a claim
// ---------------------------------------------------------------------------
const ReviewSchema = z.object({
  claimId: z.uuid(),
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(300).optional(),
  pickupNote: z.string().trim().max(300).optional(),
});

export async function reviewClaim(input: z.input<typeof ReviewSchema>): Promise<ActionResult> {
  const officer = await requireManager();
  if (!officer) return { ok: false, error: "Only the Security Officer can review claims." };
  const parsed = ReviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  const { claimId, decision, note, pickupNote } = parsed.data;

  const admin = createAdminClient();
  const { data: claimRow } = await admin.from("lost_found_claims").select("*").eq("id", claimId).maybeSingle();
  const claim = claimRow as LostFoundClaim | null;
  if (!claim) return { ok: false, error: "Claim not found." };
  if (claim.status !== "pending") return { ok: false, error: "This claim was already reviewed." };
  const item = await loadItem(claim.item_id);
  if (!item) return { ok: false, error: "Item not found." };
  const who = await whoIs(claim.claimant_id);
  const now = new Date().toISOString();

  if (decision === "reject") {
    await admin.from("lost_found_claims").update({ status: "rejected", reviewed_by: officer.id, reviewed_at: now, review_note: note || null }).eq("id", claimId);
    await logLf(officer, item.id, "claim_rejected", `${item.item_no}: claim by ${who} rejected${note ? ` — ${note}` : ""}`, claimId);
    notifyLfClaimDecision({ claimantId: claim.claimant_id, found: item, approved: false, note });
    refresh(item.id);
    return { ok: true };
  }

  if (item.status !== "open" && item.status !== "matched") return { ok: false, error: "This item is no longer open." };

  // Guarded update: if two officers approve at once only the first wins.
  const { data: won } = await admin
    .from("lost_found_items")
    .update({ status: "claimed", pickup_note: pickupNote || LF_DEFAULT_PICKUP })
    .eq("id", item.id)
    .in("status", ["open", "matched"])
    .select("*");
  if (!won || won.length === 0) return { ok: false, error: "Someone just updated this item. Refresh and check again." };
  const claimedItem = won[0] as LostFoundItem;

  await admin.from("lost_found_claims").update({ status: "approved", reviewed_by: officer.id, reviewed_at: now, review_note: note || null }).eq("id", claimId);
  if (claim.lost_id) {
    await admin.from("lost_found_items").update({ status: "claimed" }).eq("id", claim.lost_id);
    await admin.from("lost_found_matches").update({ status: "confirmed" }).eq("lost_id", claim.lost_id).eq("found_id", item.id);
  }

  // Everyone else waiting on this item is told it's gone.
  const { data: others } = await admin.from("lost_found_claims").select("id, claimant_id").eq("item_id", item.id).eq("status", "pending");
  for (const o of others ?? []) {
    await admin.from("lost_found_claims").update({ status: "rejected", reviewed_by: officer.id, reviewed_at: now, review_note: "Another claim on this item was approved." }).eq("id", o.id);
    notifyLfClaimDecision({ claimantId: o.claimant_id as string, found: claimedItem, approved: false, note: "Another claim on this item was approved." });
  }

  await logLf(officer, item.id, "claim_approved", `${item.item_no}: claim by ${who} approved`, claimId);
  notifyLfClaimDecision({ claimantId: claim.claimant_id, found: claimedItem, approved: true, note });
  if (claimedItem.held_at === "with_finder") notifyLfHandoverRequest(claimedItem);
  refresh(item.id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Security Officer: matches, handover, expiry
// ---------------------------------------------------------------------------
const MatchDecisionSchema = z.object({ lostId: z.uuid(), foundId: z.uuid(), decision: z.enum(["confirm", "reject"]) });

export async function decideMatch(input: z.input<typeof MatchDecisionSchema>): Promise<ActionResult> {
  const officer = await requireManager();
  if (!officer) return { ok: false, error: "Only the Security Officer can confirm matches." };
  const parsed = MatchDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  const { lostId, foundId, decision } = parsed.data;

  const [lost, found] = await Promise.all([loadItem(lostId), loadItem(foundId)]);
  if (!lost || !found) return { ok: false, error: "Item not found." };
  const admin = createAdminClient();

  const { data: updated } = await admin
    .from("lost_found_matches")
    .update({ status: decision === "confirm" ? "confirmed" : "rejected" })
    .eq("lost_id", lostId)
    .eq("found_id", foundId)
    .eq("status", "suggested")
    .select("lost_id");
  if (!updated || updated.length === 0) return { ok: false, error: "This match was already handled." };

  if (decision === "confirm") {
    await admin.from("lost_found_items").update({ status: "matched" }).in("id", [lostId, foundId]).eq("status", "open");
    await logLf(officer, foundId, "match_confirmed", `${lost.item_no} ↔ ${found.item_no}`);
    notifyLfMatchConfirmed(lost, found);
  } else {
    await logLf(officer, foundId, "match_rejected", `${lost.item_no} ↔ ${found.item_no}`);
  }
  refresh(foundId);
  return { ok: true };
}

export async function markReceived(itemId: string): Promise<ActionResult> {
  const officer = await requireManager();
  if (!officer) return { ok: false, error: "Only the Security Officer can do this." };
  const item = await loadItem(itemId);
  if (!item || item.type !== "found") return { ok: false, error: "Item not found." };
  await createAdminClient().from("lost_found_items").update({ held_at: "security_office" }).eq("id", itemId);
  await logLf(officer, itemId, "received", `${item.item_no} received at the Security Office from the finder`);
  refresh(itemId);
  return { ok: true };
}

export async function markReturned(itemId: string): Promise<ActionResult> {
  const officer = await requireManager();
  if (!officer) return { ok: false, error: "Only the Security Officer can do this." };
  const item = await loadItem(itemId);
  if (!item || item.type !== "found") return { ok: false, error: "Item not found." };
  if (item.status !== "claimed") return { ok: false, error: "Approve a claim before handing the item over." };
  if (item.held_at !== "security_office") return { ok: false, error: "Mark the item as received at the Security Office first." };

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: claimRow } = await admin.from("lost_found_claims").select("*").eq("item_id", itemId).eq("status", "approved").maybeSingle();
  const claim = claimRow as LostFoundClaim | null;

  await admin.from("lost_found_items").update({ status: "returned", returned_at: now }).eq("id", itemId);
  if (claim?.lost_id) await admin.from("lost_found_items").update({ status: "returned", returned_at: now }).eq("id", claim.lost_id);
  await logLf(officer, itemId, "returned", `${item.item_no} handed over to ${claim ? await whoIs(claim.claimant_id) : "owner"}`, claim?.id);
  notifyLfReturned(item, claim?.claimant_id ?? null);
  refresh(itemId);
  return { ok: true };
}

const DisposeSchema = z.object({ itemId: z.uuid(), disposition: z.enum(LF_DISPOSITIONS) });

export async function disposeItem(input: z.input<typeof DisposeSchema>): Promise<ActionResult> {
  const officer = await requireManager();
  if (!officer) return { ok: false, error: "Only the Security Officer can do this." };
  const parsed = DisposeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  const item = await loadItem(parsed.data.itemId);
  if (!item || item.type !== "found") return { ok: false, error: "Item not found." };
  if (item.status !== "open" && item.status !== "matched") return { ok: false, error: "Only unclaimed items can be disposed of." };

  const admin = createAdminClient();
  const { count } = await admin.from("lost_found_claims").select("id", { count: "exact", head: true }).eq("item_id", item.id).eq("status", "pending");
  if (count) return { ok: false, error: "This item has a claim waiting. Review the claim first." };

  await admin.from("lost_found_items").update({ status: "expired", disposition: parsed.data.disposition }).eq("id", item.id);
  await logLf(officer, item.id, parsed.data.disposition, `${item.item_no} marked ${parsed.data.disposition} after ${Math.floor((Date.now() - Date.parse(item.created_at)) / 86_400_000)} days`);
  refresh(item.id);
  return { ok: true };
}

const VerificationSchema = z.object({
  itemId: z.uuid(),
  question: z.string().trim().max(200),
  answer: z.string().trim().max(200),
});

export async function updateVerification(input: z.input<typeof VerificationSchema>): Promise<ActionResult> {
  const officer = await requireManager();
  if (!officer) return { ok: false, error: "Only the Security Officer can do this." };
  const parsed = VerificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That question or answer is too long." };
  const item = await loadItem(parsed.data.itemId);
  if (!item || item.type !== "found") return { ok: false, error: "Item not found." };
  await createAdminClient()
    .from("lost_found_items")
    .update({ verification_question: parsed.data.question || null, verification_answer: parsed.data.answer || null })
    .eq("id", item.id);
  await logLf(officer, item.id, "verification_updated", `${item.item_no} verification question updated`);
  refresh(item.id);
  return { ok: true };
}

/** The owner got their lost item back (or gave up): closes their own lost report. */
export async function closeMyItem(itemId: string): Promise<ActionResult> {
  const profile = await requireReporter();
  if (!profile) return { ok: false, error: "Please log in again." };
  const item = await loadItem(itemId);
  if (!item || item.reporter_id !== profile.id || item.type !== "lost") return { ok: false, error: "Item not found." };
  if (item.status === "returned" || item.status === "expired") return { ok: true };
  await createAdminClient().from("lost_found_items").update({ status: "returned", returned_at: new Date().toISOString() }).eq("id", itemId);
  await logLf(profile, itemId, "closed_by_owner", `${item.item_no} closed by the owner`);
  refresh(itemId);
  return { ok: true };
}
