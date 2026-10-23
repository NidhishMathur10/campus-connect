"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { canActOnEscalation } from "@/lib/escalation-queries";
import { linkedTickets } from "@/lib/escalations";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Escalation, Profile } from "@/lib/types";
import type { ActionResult } from "@/lib/tickets/actions";

async function loadOwn(
  id: string,
): Promise<{ ok: true; profile: Profile; escalation: Escalation } | { ok: false; error: string }> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "Unknown escalation." };
  const { data } = await createAdminClient().from("escalations").select("*").eq("id", id).maybeSingle();
  const escalation = data as Escalation | null;
  if (!escalation) return { ok: false, error: "Unknown escalation." };
  if (!canActOnEscalation(profile, escalation)) {
    return { ok: false, error: `Only the ${escalation.target_role === "dean" ? "Dean" : "HOD"} can act on this escalation.` };
  }
  return { ok: true, profile, escalation };
}

function refresh(id: string) {
  revalidatePath("/escalations");
  revalidatePath(`/escalations/${id}`);
  revalidatePath("/staff");
  revalidatePath("/tickets");
}

export async function acknowledgeEscalation(id: string): Promise<ActionResult> {
  const loaded = await loadOwn(id);
  if (!loaded.ok) return loaded;
  if (loaded.escalation.status !== "open") return { ok: true };
  const { error } = await createAdminClient()
    .from("escalations")
    .update({ status: "acknowledged", acknowledged_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not acknowledge. Please try again." };
  refresh(id);
  return { ok: true };
}

/** Saves the directive and posts it on every linked ticket (visible to staff and students). */
export async function addDirective(id: string, text: string): Promise<ActionResult> {
  const directive = text.trim();
  if (directive.length < 5) return { ok: false, error: "Write the directive first." };
  if (directive.length > 1000) return { ok: false, error: "Keep the directive under 1000 characters." };
  const loaded = await loadOwn(id);
  if (!loaded.ok) return loaded;
  const { profile, escalation } = loaded;
  const admin = createAdminClient();

  const now = new Date().toISOString();
  const { error } = await admin
    .from("escalations")
    .update({
      directive,
      status: escalation.status === "resolved" ? "resolved" : "acknowledged",
      acknowledged_at: escalation.acknowledged_at ?? now,
      updated_at: now,
    })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not save the directive. Please try again." };

  const tickets = await linkedTickets(admin, escalation);
  const who = profile.role === "dean" ? "Dean" : "HOD";
  if (tickets.length) {
    const { error: evErr } = await admin.from("ticket_events").insert(
      tickets.map((t) => ({
        ticket_id: t.id,
        actor_id: profile.id,
        actor_name: profile.full_name,
        actor_role: profile.role,
        type: "note",
        note: `Directive from ${who}: ${directive}`,
      })),
    );
    if (evErr) console.error("[addDirective] events", evErr.message);
  }
  refresh(id);
  return { ok: true };
}

export async function resolveEscalation(id: string): Promise<ActionResult> {
  const loaded = await loadOwn(id);
  if (!loaded.ok) return loaded;
  const admin = createAdminClient();
  const tickets = await linkedTickets(admin, loaded.escalation);
  if (!tickets.every((t) => t.status === "Closed" || t.status === "Merged")) {
    return { ok: false, error: "Some linked tickets are still open. Close them first." };
  }
  const now = new Date().toISOString();
  const { error } = await admin
    .from("escalations")
    .update({ status: "resolved", resolved_at: now, acknowledged_at: loaded.escalation.acknowledged_at ?? now, updated_at: now })
    .eq("id", id);
  if (error) return { ok: false, error: "Could not resolve. Please try again." };
  refresh(id);
  return { ok: true };
}
