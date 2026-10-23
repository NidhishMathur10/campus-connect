import "server-only";
import twilio from "twilio";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * WhatsApp delivery through the Twilio WhatsApp Sandbox. Like email: never throws, always logs
 * (sent / failed / skipped) to `email_log` with channel = 'whatsapp', and runs via `inBackground()`.
 * The auth token only ever lives on the server.
 */

interface TwilioEnv {
  sid: string;
  token: string;
  from: string;
  demoTo: string;
}

/** All four env vars, or the name of the first missing one. */
function readEnv(): { env: TwilioEnv } | { missing: string } {
  const get = (k: string) => process.env[k]?.trim() ?? "";
  for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "DEMO_NOTIFY_WHATSAPP"]) {
    if (!get(key)) return { missing: key };
  }
  return {
    env: {
      sid: get("TWILIO_ACCOUNT_SID"),
      token: get("TWILIO_AUTH_TOKEN"),
      from: get("TWILIO_WHATSAPP_FROM"),
      demoTo: get("DEMO_NOTIFY_WHATSAPP"),
    },
  };
}

export function whatsappConfigured(): boolean {
  return "env" in readEnv();
}

const withPrefix = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n}`);

/** "+91 98765 43210" → "+919876543210" (null if it is not a plausible E.164 number). */
export function normalisePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
}

export interface OutgoingWhatsApp {
  /** The person's real number (E.164). Null for demo accounts without one. */
  to: string | null;
  /** Set for seeded demo accounts: the message goes to DEMO_NOTIFY_WHATSAPP, prefixed with their name. */
  demoFor?: string | null;
  template: string;
  ticketId?: string | null;
  body: string;
}

async function log(row: {
  to_email: string;
  original_to: string | null;
  template: string;
  ticket_id: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string | null;
}) {
  const { error } = await createAdminClient()
    .from("email_log")
    .insert({ ...row, channel: "whatsapp", error: row.error ?? null });
  if (error) console.error("[whatsapp] could not write log:", error.message);
}

export async function deliverWhatsApp(msg: OutgoingWhatsApp): Promise<void> {
  const base = {
    to_email: msg.to ?? "-",
    original_to: null as string | null,
    template: msg.template,
    ticket_id: msg.ticketId ?? null,
  };
  try {
    const cfg = readEnv();
    if ("missing" in cfg) {
      await log({ ...base, status: "skipped", error: `${cfg.missing} is not set` });
      return;
    }
    const { env } = cfg;
    let to = msg.to;
    let body = msg.body;
    if (msg.demoFor) {
      base.original_to = msg.to ?? msg.demoFor;
      to = env.demoTo;
      body = `[Demo: for ${msg.demoFor}] ${body}`;
    }
    if (!to) {
      await log({ ...base, status: "skipped", error: "No phone number" });
      return;
    }
    base.to_email = to;
    try {
      await twilio(env.sid, env.token).messages.create({
        from: withPrefix(env.from),
        to: withPrefix(to),
        body: body.slice(0, 500),
      });
      await log({ ...base, status: "sent" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp] send failed:", message);
      await log({ ...base, status: "failed", error: message.slice(0, 500) });
    }
  } catch (err) {
    console.error("[whatsapp]", err instanceof Error ? err.message : err);
  }
}
