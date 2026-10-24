import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PushPayload } from "./messages";

/**
 * Web Push delivery (CLAUDE.md §24). Like email/WhatsApp: never throws, runs inside `inBackground()`,
 * and every attempt is written to `email_log` with channel = 'push' (sent / failed / skipped).
 * Subscriptions the push service reports as gone (404 / 410) are deleted.
 */

export function pushConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
    process.env.VAPID_PRIVATE_KEY?.trim() &&
    process.env.VAPID_SUBJECT?.trim()
  );
}

let vapidReady = false;
function setup(): boolean {
  if (!pushConfigured()) return false;
  if (!vapidReady) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT!.trim(),
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim(),
    );
    vapidReady = true;
  }
  return true;
}

export interface PushRecipient {
  id: string;
  full_name: string;
  role: string;
}

export interface PushMeta {
  /** email_log template name, e.g. "staff_assigned". Use "confidential_update" for confidential cases. */
  template: string;
  ticketId?: string | null;
}

type LogRow = {
  to_email: string;
  template: string;
  ticket_id: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
};

async function log(row: LogRow) {
  const { error } = await createAdminClient()
    .from("email_log")
    .insert({ ...row, original_to: null, channel: "push", error: row.error ?? null });
  if (error) console.error("[push] could not write log:", error.message);
}

interface SubRow {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Pushes one message to every phone/browser a person has turned alerts on for.
 * Staff with no device are logged as skipped; students without one are ignored silently (too noisy).
 */
export async function deliverPush(person: PushRecipient, payload: PushPayload, meta: PushMeta): Promise<void> {
  try {
    if (!setup()) return;
    const admin = createAdminClient();
    const base = { to_email: person.full_name, template: meta.template, ticket_id: meta.ticketId ?? null };

    const { data } = await admin.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", person.id);
    const subs = (data ?? []) as SubRow[];
    if (subs.length === 0) {
      if (person.role !== "student") await log({ ...base, status: "skipped", error: "No device has job alerts turned on" });
      return;
    }

    const body = JSON.stringify(payload);
    let delivered = 0;
    let lastError: string | null = null;
    const gone: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 12 * 3600, urgency: "high" });
          delivered++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.id);
          lastError = `${status ? `HTTP ${status}: ` : ""}${err instanceof Error ? err.message : String(err)}`.slice(0, 400);
        }
      }),
    );
    if (gone.length) await admin.from("push_subscriptions").delete().in("id", gone);

    const devices = `${subs.length} device${subs.length === 1 ? "" : "s"}`;
    if (delivered > 0) {
      await log({ ...base, to_email: `${person.full_name} (${devices})`, status: "sent" });
    } else {
      const expired = gone.length === subs.length;
      await log({ ...base, status: "failed", error: expired ? "Subscription expired — removed" : lastError });
    }
  } catch (err) {
    console.error("[push]", err instanceof Error ? err.message : err);
  }
}

/** Same kind of message for several people (sequential, like the other channels). */
export async function pushToPeople(people: PushRecipient[], build: (p: PushRecipient) => PushPayload | null, meta: PushMeta) {
  for (const person of people) {
    const payload = build(person);
    if (payload) await deliverPush(person, payload, meta);
  }
}
