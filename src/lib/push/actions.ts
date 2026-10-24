"use server";

import { z } from "zod";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true } | { ok: false; error: string };

const subscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(500), auth: z.string().min(5).max(200) }),
});

/** Saves this phone/browser for the signed-in user (the endpoint is unique: a shared phone moves to whoever turned alerts on last). */
export async function savePushSubscription(input: unknown, userAgent: string): Promise<Result> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };
  const sub = subscriptionSchema.safeParse(input);
  if (!sub.success) return { ok: false, error: "This browser sent an invalid push subscription." };

  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      { user_id: profile.id, endpoint: sub.data.endpoint, keys: sub.data.keys, user_agent: userAgent.slice(0, 300) },
      { onConflict: "endpoint" },
    );
  if (error) {
    console.error("[savePushSubscription]", error.message);
    return { ok: false, error: "Could not save alerts. Please try again." };
  }
  return { ok: true };
}

/** Turns alerts off for this phone/browser (only the signed-in user's own row). */
export async function removePushSubscription(endpoint: string): Promise<Result> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: true };
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("user_id", profile.id)
    .eq("endpoint", endpoint);
  if (error) {
    console.error("[removePushSubscription]", error.message);
    return { ok: false, error: "Could not turn alerts off. Please try again." };
  }
  return { ok: true };
}

/** Is this exact endpoint saved for me? (The browser can hold a subscription the server no longer knows about.) */
export async function isPushSubscriptionSaved(endpoint: string): Promise<boolean> {
  const { profile } = await getCurrentProfile();
  if (!profile) return false;
  const { data } = await createAdminClient()
    .from("push_subscriptions")
    .select("id")
    .eq("user_id", profile.id)
    .eq("endpoint", endpoint)
    .maybeSingle();
  return !!data;
}
