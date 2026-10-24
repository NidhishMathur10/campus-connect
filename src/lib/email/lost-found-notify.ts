import "server-only";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LostFoundItem } from "@/lib/lost-found/types";
import { inBackground } from "./send";
import { appUrl } from "./templates";
import { clip, notifyInApp, PERSON_COLUMNS, peopleByIds, send, wa, type Person } from "./notify";

/**
 * Lost & Found notifications (CLAUDE.md §20): email + WhatsApp (when enabled) + the in-app bell,
 * all through the same helpers as ticket notifications, so they follow the same demo redirects,
 * opt-in rules and email_log. Every function is fire-and-forget and can never fail the user's action.
 * Messages never contain a person's name; the only private detail ever sent is the item title.
 */

const itemPath = (id: string) => `/lost-found/${id}`;
const deskPath = "/lost-found/desk";

export interface Alert {
  recipients: Person[];
  /** In-app bell kind (default: lost_found). */
  kind?: "lost_found" | "doubt" | "ticket" | "notice";
  template: string;
  /** Email subject / heading and bell title. */
  title: string;
  message: string;
  rows?: [string, string][];
  buttonLabel: string;
  path: string;
  /** Skip the in-app bell row (default true) when something else already creates it, e.g. the ticket_events trigger. */
  inApp?: boolean;
}

export async function deliverAlert(a: Alert): Promise<void> {
  const url = appUrl(a.path);
  for (const person of a.recipients) {
    await send(person, a.template, null, a.title, {
      preheader: a.message,
      heading: a.title,
      paragraphs: [`Hi ${person.full_name}, ${a.message}`],
      rows: a.rows,
      button: { label: a.buttonLabel, url },
    });
    await wa(person, a.template, null, `CampusConnect: ${clip(a.title, 90)}. ${clip(a.message, 200)} ${url}`);
  }
  if (a.inApp === false) return;
  await notifyInApp(
    a.recipients.map((p) => ({ user_id: p.id, kind: a.kind ?? ("lost_found" as const), title: a.title, body: clip(a.message, 160), link: a.path })),
  );
}

const placeOf = (i: Pick<LostFoundItem, "building" | "spot">) => [i.building, i.spot].filter(Boolean).join(" · ") || "Place not given";

export interface MatchPair {
  lost: LostFoundItem;
  found: LostFoundItem;
  score: number;
  reason: string;
}

/** "A possible match was found" to the person who lost it AND the person who found it. */
export function notifyLfMatches(pairs: MatchPair[]): void {
  if (pairs.length === 0) return;
  inBackground(async () => {
    for (const { lost, found, score, reason } of pairs) {
      const [owner, finder] = await Promise.all([peopleByIds([lost.reporter_id]), peopleByIds([found.reporter_id])]);
      const pct = `${Math.round(score * 100)}% likely`;
      await deliverAlert({
        recipients: owner,
        template: "lf_match",
        title: "A possible match was found",
        message: `Someone reported finding "${found.title}" (${placeOf(found)}), which could be your lost "${lost.title}". Open it and tap "This is mine" if it is yours.`,
        rows: [["Your lost item", `${lost.item_no} · ${lost.title}`], ["Possible match", `${found.item_no} · ${found.title}`], ["Why", reason || pct]],
        buttonLabel: "View the match",
        path: itemPath(found.id),
      });
      await deliverAlert({
        recipients: finder,
        template: "lf_match",
        title: "A possible match was found",
        message: `Someone reported losing "${lost.title}", which could be the "${found.title}" you found. The Security Office will check it and may ask you to hand the item over.`,
        rows: [["Your found item", `${found.item_no} · ${found.title}`], ["Possible match", `${lost.item_no} · ${lost.title}`], ["Why", reason || pct]],
        buttonLabel: "View the report",
        path: itemPath(lost.id),
      });
    }
  });
}

/** Security Officer(s): a new claim is waiting on the desk. */
export function notifyLfClaimSubmitted(found: LostFoundItem): void {
  inBackground(async () => {
    const { data } = await createAdminClient().from("profiles").select(PERSON_COLUMNS).eq("role", "security_officer");
    await deliverAlert({
      recipients: (data ?? []) as Person[],
      template: "lf_claim_submitted",
      title: `New claim on ${found.item_no}`,
      message: `Someone says "${found.title}" is theirs. Compare their answer with the item and approve or reject the claim.`,
      rows: [["Found item", `${found.item_no} · ${found.title}`], ["Where found", placeOf(found)]],
      buttonLabel: "Review the claim",
      path: deskPath,
    });
  });
}

/** The claimant hears the decision. Approved: where to collect it. */
export function notifyLfClaimDecision(opts: { claimantId: string; found: LostFoundItem; approved: boolean; note?: string | null }): void {
  inBackground(async () => {
    const { claimantId, found, approved, note } = opts;
    const recipients = await peopleByIds([claimantId]);
    await deliverAlert({
      recipients,
      template: approved ? "lf_claim_approved" : "lf_claim_rejected",
      title: approved ? `Your claim on ${found.item_no} was approved` : `Your claim on ${found.item_no} was not approved`,
      message: approved
        ? `${found.pickup_note || "Collect it from the Security Office. Bring your college ID card."}${note ? ` Note from security: ${note}` : ""}`
        : `The Security Office could not verify that "${found.title}" is yours.${note ? ` Note: ${note}` : ""} If it is yours, visit the Security Office with your college ID card.`,
      rows: [["Item", `${found.item_no} · ${found.title}`]],
      buttonLabel: "Open the item",
      path: itemPath(found.id),
    });
  });
}

/** The finder: asked to hand the item in (claim approved on an item they still hold). */
export function notifyLfHandoverRequest(found: LostFoundItem): void {
  inBackground(async () => {
    await deliverAlert({
      recipients: await peopleByIds([found.reporter_id]),
      template: "lf_handover_request",
      title: `Please hand in ${found.item_no} to the Security Office`,
      message: `The owner of "${found.title}" has been verified. Please hand the item to the Security Office so they can collect it. Thank you for helping!`,
      buttonLabel: "Open the item",
      path: itemPath(found.id),
    });
  });
}

/** Handover done: thank the finder, tell the owner it is recorded. */
export function notifyLfReturned(found: LostFoundItem, claimantId: string | null): void {
  inBackground(async () => {
    await deliverAlert({
      recipients: await peopleByIds([found.reporter_id]),
      template: "lf_returned",
      title: `${found.item_no} was returned to its owner`,
      message: `"${found.title}" has been handed back to its owner. Thank you for reporting it!`,
      buttonLabel: "Open the item",
      path: itemPath(found.id),
    });
    if (claimantId) {
      await deliverAlert({
        recipients: await peopleByIds([claimantId]),
        template: "lf_returned",
        title: `${found.item_no} marked as returned`,
        message: `The Security Office recorded the handover of "${found.title}". If this is wrong, please contact them.`,
        buttonLabel: "Open the item",
        path: itemPath(found.id),
      });
    }
  });
}

/** Officer confirmed a suggested match: tell the owner to claim it, and the finder it is likely owned. */
export function notifyLfMatchConfirmed(lost: LostFoundItem, found: LostFoundItem): void {
  inBackground(async () => {
    await deliverAlert({
      recipients: await peopleByIds([lost.reporter_id]),
      template: "lf_match_confirmed",
      title: "Security confirmed a likely match",
      message: `The Security Office thinks "${found.title}" is your "${lost.title}". Tap "This is mine" and answer the verification question to claim it.`,
      rows: [["Found item", `${found.item_no} · ${found.title}`], ["Found", `${placeOf(found)} · ${formatDateTime(found.happened_at)}`]],
      buttonLabel: "Claim it",
      path: itemPath(found.id),
    });
    await deliverAlert({
      recipients: await peopleByIds([found.reporter_id]),
      template: "lf_match_confirmed",
      title: `Likely owner found for ${found.item_no}`,
      message: `The Security Office matched "${found.title}" with a lost-item report. If you still have it, please hand it to the Security Office.`,
      buttonLabel: "Open the item",
      path: itemPath(found.id),
    });
  });
}
