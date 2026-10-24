"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TRIAGE_DEPARTMENT } from "@/config/routing";
import { PHOTO_BUCKET } from "@/config/storage";
import { adminRecipientIds } from "@/lib/assignment";
import { getCurrentProfile } from "@/lib/auth";
import { notifyStaffAlert } from "@/lib/email/notify";
import { canManageTicket } from "@/lib/tickets/access";
import type { ActionResult } from "@/lib/tickets/actions";
import {
  changeTicketStatus,
  addTicketNote,
  overrideTicketField,
  pauseTicketSla,
  resumeTicketSla,
} from "@/lib/tickets/staff-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Ticket } from "@/lib/types";
import { ensureHindiTitles } from "./hindi";
import type { HelpKind } from "./types";

/**
 * Server actions behind the simple "My Jobs" view. They are thin wrappers around the existing staff actions
 * (changeTicketStatus, pauseTicketSla, ...), so events, notifications, SLA rules and confidentiality are unchanged.
 */

const NOTE_MAX = 300;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

async function loadMine(
  ticketId: string,
): Promise<{ ok: true; profile: Profile; ticket: Ticket } | { ok: false; error: string }> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(ticketId).success) return { ok: false, error: "Unknown job." };
  const { data } = await createAdminClient().from("tickets").select("*").eq("id", ticketId).maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket) return { ok: false, error: "That job no longer exists." };
  if (!canManageTicket(profile, ticket)) return { ok: false, error: "You can't change this job." };
  return { ok: true, profile, ticket };
}

function refresh(ticketNo: string) {
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${ticketNo}`);
}

/** Moves Assigned / Reopened work to In Progress, optionally without telling the student yet. */
async function ensureStarted(ticket: Ticket, silent: boolean): Promise<ActionResult> {
  if (ticket.status === "In Progress") return { ok: true };
  return changeTicketStatus(ticket.id, { to: "In Progress", note: "Our team has started working on this.", silent });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
export async function startJob(ticketId: string): Promise<ActionResult> {
  const loaded = await loadMine(ticketId);
  if (!loaded.ok) return loaded;
  const { ticket } = loaded;
  // A job that is waiting for parts: "Start" means "work resumed".
  const res = ticket.sla_paused_at ? await resumeTicketSla(ticket.id) : await ensureStarted(ticket, false);
  refresh(ticket.ticket_no);
  return res;
}

// ---------------------------------------------------------------------------
// Done (+ optional "after" photo)
// ---------------------------------------------------------------------------
export async function completeJob(
  ticketId: string,
  input: { note?: string; photoPath?: string | null },
): Promise<ActionResult> {
  const loaded = await loadMine(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket } = loaded;
  const note = (input.note ?? "").trim().slice(0, NOTE_MAX) || "The issue has been fixed.";

  // Started and finished in one go: the student is told once, at "Resolved".
  const started = await ensureStarted(ticket, true);
  if (!started.ok) return started;

  if (input.photoPath) {
    if (!input.photoPath.startsWith(`${profile.id}/`) || input.photoPath.includes("..")) {
      return { ok: false, error: "That photo can't be used." };
    }
    const admin = createAdminClient();
    const url = admin.storage.from(PHOTO_BUCKET).getPublicUrl(input.photoPath).data.publicUrl;
    await admin
      .from("tickets")
      .update({ ai_meta: { ...(ticket.ai_meta ?? {}), after_photo_url: url } })
      .eq("id", ticket.id);
  }

  const res = await changeTicketStatus(ticket.id, { to: "Resolved", note });
  refresh(ticket.ticket_no);
  return res;
}

/** Uploads the "after" photo (already shrunk in the browser) and returns its storage path. */
export async function uploadJobPhoto(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  const file = formData.get("photo");
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: "Pick a photo first." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Only photos can be added." };

  const path = `${profile.id}/after-${crypto.randomUUID()}.jpg`;
  const { error } = await createAdminClient()
    .storage.from(PHOTO_BUCKET)
    .upload(path, file, { contentType: "image/jpeg", upsert: false });
  if (error) {
    console.error("[uploadJobPhoto]", error.message);
    return { ok: false, error: "The photo could not be uploaded." };
  }
  return { ok: true, path };
}

// ---------------------------------------------------------------------------
// Need help
// ---------------------------------------------------------------------------
export async function needHelp(ticketId: string, kind: HelpKind): Promise<ActionResult> {
  if (!["parts", "person", "access", "not_mine"].includes(kind)) return { ok: false, error: "Pick one of the options." };
  const loaded = await loadMine(ticketId);
  if (!loaded.ok) return loaded;
  const { profile, ticket } = loaded;

  const admin = createAdminClient();
  const alertAdmins = async (message: string) => {
    const recipientIds = await adminRecipientIds(admin, ticket.module);
    if (recipientIds.length) {
      notifyStaffAlert({
        ticketId: ticket.id,
        recipientIds,
        template: "help_request",
        title: `${profile.full_name} needs help with ${ticket.ticket_no}`,
        message,
      });
    }
  };
  const who = `${profile.full_name} (${ticket.department})`;
  let res: ActionResult = { ok: true };

  if (kind === "parts") {
    // The deadline timer can only be paused on work that has started.
    res = await ensureStarted(ticket, true);
    if (res.ok && !ticket.sla_paused_at) res = await pauseTicketSla(ticket.id, "Waiting for parts");
  } else if (kind === "person") {
    res = await addTicketNote(ticket.id, { note: "Needs another person to help with this job.", internal: true });
    if (res.ok) await alertAdmins(`${who} needs another person to help with this job.`);
  } else if (kind === "access") {
    res = await addTicketNote(ticket.id, {
      note: "Our staff member could not get into the place. Please make sure it is open and accessible, or tell us a good time.",
      internal: false,
    });
    if (res.ok) await alertAdmins(`${who} could not access the room or place for this job.`);
  } else {
    if (ticket.module === "security" || ticket.is_confidential) {
      return { ok: false, error: "Safety reports can't be sent on from here. Please ask your supervisor." };
    }
    // Hostel: the warden's triage lane. Academic: the Academic Office.
    const target = ticket.module === "hostel" ? TRIAGE_DEPARTMENT : "Academic Office";
    res = await overrideTicketField(ticket.id, {
      field: "department",
      value: target,
      reason: `Not a ${ticket.department} job (flagged by ${profile.full_name})`,
    });
    if (res.ok) {
      // The ticket no longer has an owner: back to the start of the queue.
      const { data: fresh } = await admin.from("tickets").select("status, assigned_to").eq("id", ticket.id).maybeSingle();
      if (fresh && fresh.status !== "Submitted" && fresh.status !== "Assigned" && !fresh.assigned_to) {
        await admin.from("tickets").update({ status: "Submitted" }).eq("id", ticket.id);
        await admin.from("ticket_events").insert({
          ticket_id: ticket.id,
          actor_id: profile.id,
          actor_name: profile.full_name,
          actor_role: profile.role,
          type: "status_change",
          from_status: fresh.status,
          to_status: "Submitted",
        });
      }
      await alertAdmins(`${who} says this is not their department's job. It is waiting for triage.`);
    }
  }
  refresh(ticket.ticket_no);
  return res;
}

// ---------------------------------------------------------------------------
// Hindi titles for the card headline
// ---------------------------------------------------------------------------
export async function getHindiTitles(ids: string[]): Promise<Record<string, string>> {
  const { profile } = await getCurrentProfile();
  if (!profile) return {};
  const valid = ids.filter((id) => z.uuid().safeParse(id).success);
  try {
    return await ensureHindiTitles(profile.id, valid);
  } catch (err) {
    console.error("[getHindiTitles]", err instanceof Error ? err.message : err);
    return {};
  }
}
