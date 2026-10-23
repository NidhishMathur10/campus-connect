import type { LfCategory, LfDisposition, LfHeldAt, LfStatus, LfType } from "@/config/lost-found";

/** Row types mirroring the Lost & Found tables in supabase/schema.sql. */

export interface LostFoundItem {
  id: string;
  item_no: string;
  type: LfType;
  reporter_id: string;
  title: string;
  description: string;
  public_description: string | null;
  item_category: LfCategory;
  color: string | null;
  brand: string | null;
  marks: string | null;
  sensitive: boolean;
  building: string | null;
  spot: string | null;
  happened_at: string;
  photo_url: string | null;
  photo_path: string | null;
  photo_analysis: { observed: string; matches_complaint: boolean; notes: string } | null;
  status: LfStatus;
  held_at: LfHeldAt | null;
  pickup_note: string | null;
  verification_question: string | null;
  verification_answer: string | null;
  disposition: LfDisposition | null;
  language: string;
  ai_meta: Record<string, unknown> | null;
  returned_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LfMatchStatus = "suggested" | "confirmed" | "rejected";
export interface LostFoundMatch {
  lost_id: string;
  found_id: string;
  score: number;
  reason: string | null;
  status: LfMatchStatus;
  created_at: string;
}

export type LfClaimStatus = "pending" | "approved" | "rejected";
export interface LostFoundClaim {
  id: string;
  item_id: string;
  claimant_id: string;
  lost_id: string | null;
  answer: string;
  match_score: number | null;
  match_reason: string | null;
  status: LfClaimStatus;
  reviewed_by: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * What any signed-in viewer may see of an item. Never carries reporter_id, the reporter's name,
 * verification_answer, or (for sensitive items, unless the viewer owns it / is staff) brand, marks
 * and the real photo URL.
 */
export interface PublicItem {
  id: string;
  item_no: string;
  type: LfType;
  title: string;
  description: string;
  item_category: LfCategory;
  color: string | null;
  brand: string | null;
  marks: string | null;
  sensitive: boolean;
  building: string | null;
  spot: string | null;
  happened_at: string;
  /** Real photo, or a server-blurred copy for sensitive items; null when there is no photo. */
  photo_src: string | null;
  /** The photo is the blurred copy. */
  photo_blurred: boolean;
  status: LfStatus;
  held_at: LfHeldAt | null;
  created_at: string;
  /** The viewer reported this item. */
  is_mine: boolean;
}
