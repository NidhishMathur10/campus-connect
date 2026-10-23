"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  AUTO_ASSIGN_DEPARTMENTS,
  AUTO_ASSIGN_ROLES,
  DEMO_MODE,
  SETTING_AUTO_ASSIGN_DISABLED,
  SETTING_REASSIGN_MANUAL,
} from "@/config/assignment";
import { BUILDINGS } from "@/config/locations";
import { getAssignmentSettings, saveSetting, SYSTEM_ACTOR } from "@/lib/assignment";
import { getCurrentProfile } from "@/lib/auth";
import { runSlaWatcher, type SlaWatcherResult } from "@/lib/sla-watcher";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, Ticket } from "@/lib/types";
import { canViewStaffTicket } from "./tickets/access";
import type { ActionResult } from "./tickets/actions";

const ADMIN_ROLES: Profile["role"][] = ["warden", "dean"];

async function requireAdmin(roles: Profile["role"][] = ADMIN_ROLES): Promise<Profile | null> {
  const { profile } = await getCurrentProfile();
  return profile && roles.includes(profile.role) ? profile : null;
}

function refresh() {
  revalidatePath("/staff");
  revalidatePath("/directory");
}

/** Staff toggle their own "On leave"; the warden and the Dean can toggle anyone's. */
export async function setStaffOnLeave(staffId: string, onLeave: boolean): Promise<ActionResult> {
  const { profile } = await getCurrentProfile();
  if (!profile || !z.uuid().safeParse(staffId).success) return { ok: false, error: "Please log in again." };
  const own = staffId === profile.id && (AUTO_ASSIGN_ROLES as readonly string[]).includes(profile.role);
  if (!own && !ADMIN_ROLES.includes(profile.role)) return { ok: false, error: "You can only change your own availability." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update({ on_leave: onLeave })
    .eq("id", staffId)
    .in("role", [...AUTO_ASSIGN_ROLES])
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Could not update availability. Please try again." };
  refresh();
  return { ok: true };
}

export async function setPreferredBuildings(staffId: string, buildings: string[]): Promise<ActionResult> {
  if (!(await requireAdmin()) || !z.uuid().safeParse(staffId).success) return { ok: false, error: "Only the warden or the Dean can do this." };
  const clean = [...new Set(buildings)].filter((b) => (BUILDINGS as readonly string[]).includes(b));
  const { data, error } = await createAdminClient()
    .from("profiles")
    .update({ preferred_buildings: clean })
    .eq("id", staffId)
    .in("role", [...AUTO_ASSIGN_ROLES])
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Could not save. Please try again." };
  refresh();
  return { ok: true };
}

/** Warden setting: auto-assignment on/off for one department. */
export async function setDepartmentAutoAssign(department: string, enabled: boolean): Promise<ActionResult> {
  if (!(await requireAdmin(["warden"]))) return { ok: false, error: "Only the warden can change this." };
  if (!(AUTO_ASSIGN_DEPARTMENTS as string[]).includes(department)) return { ok: false, error: "Unknown department." };
  const admin = createAdminClient();
  const { disabledDepartments } = await getAssignmentSettings(admin);
  const next = enabled ? disabledDepartments.filter((d) => d !== department) : [...new Set([...disabledDepartments, department])];
  if (!(await saveSetting(admin, SETTING_AUTO_ASSIGN_DISABLED, next))) return { ok: false, error: "Could not save. Please try again." };
  refresh();
  return { ok: true };
}

/** Warden setting: let the SLA watcher also re-assign tickets a person assigned by hand. */
export async function setReassignManual(enabled: boolean): Promise<ActionResult> {
  if (!(await requireAdmin(["warden"]))) return { ok: false, error: "Only the warden can change this." };
  if (!(await saveSetting(createAdminClient(), SETTING_REASSIGN_MANUAL, enabled))) return { ok: false, error: "Could not save. Please try again." };
  refresh();
  return { ok: true };
}

/** "Run SLA check now" (warden / Dean). */
export async function runSlaCheckNow(): Promise<ActionResult<{ summary: SlaWatcherResult }>> {
  if (!(await requireAdmin())) return { ok: false, error: "Only the warden or the Dean can do this." };
  const summary = await runSlaWatcher({ force: true });
  refresh();
  revalidatePath("/escalations");
  return { ok: true, summary };
}

/** Demo helper: pretend the deadline passed one minute ago, so the next SLA check re-assigns the ticket. */
export async function simulateDeadlinePassed(ticketId: string): Promise<ActionResult> {
  if (!DEMO_MODE) return { ok: false, error: "Demo mode is off." };
  const profile = await requireAdmin();
  if (!profile || !z.uuid().safeParse(ticketId).success) return { ok: false, error: "Only the warden or the Dean can do this." };

  const admin = createAdminClient();
  const { data } = await admin.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  const ticket = data as Ticket | null;
  if (!ticket || !canViewStaffTicket(profile, ticket)) return { ok: false, error: "That ticket no longer exists." };
  if (ticket.sla_paused_at) return { ok: false, error: "This ticket is waiting on parts — resume it first." };
  if (!["Submitted", "Assigned", "In Progress", "Reopened"].includes(ticket.status)) return { ok: false, error: "Only open tickets have a running deadline." };

  const { error } = await admin
    .from("tickets")
    .update({ sla_due_at: new Date(Date.now() - 60_000).toISOString(), sla_reminded_at: null })
    .eq("id", ticket.id);
  if (error) return { ok: false, error: "Could not change the deadline." };
  await admin.from("ticket_events").insert({
    ticket_id: ticket.id,
    ...SYSTEM_ACTOR,
    type: "note",
    is_internal: true,
    note: `Demo: ${profile.full_name} moved the deadline to 1 minute ago.`,
  });
  refresh();
  return { ok: true };
}
