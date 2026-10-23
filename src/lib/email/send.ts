import "server-only";
import { after } from "next/server";
import nodemailer, { type Transporter } from "nodemailer";
import { isDemoEmail } from "@/config/demo-accounts";
import { collegeEmailDomain } from "@/config/email";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Email delivery. Never throws and never blocks the caller: every public function here is
 * meant to run through `inBackground()` after the response has been sent.
 */

let cached: Transporter | null | undefined;

/** SMTP transport from env, or null when email isn't configured (then sending is skipped silently). */
function getTransport(): Transporter | null {
  if (cached !== undefined) return cached;
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return (cached = null);
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    // Mailpit (localhost:1025) needs no auth.
    ...(user && pass ? { auth: { user, pass } } : {}),
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return cached;
}

export function emailEnabled(): boolean {
  return !!process.env.SMTP_HOST?.trim();
}

/** Runs `job` after the response when possible (Next.js after()), otherwise fire-and-forget. */
export function inBackground(job: () => Promise<unknown>): void {
  const safe = async () => {
    try {
      await job();
    } catch (err) {
      console.error("[email]", err instanceof Error ? err.message : err);
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}

export interface OutgoingEmail {
  /** Who it is for (their real address). */
  to: string;
  template: string;
  ticketId?: string | null;
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function log(row: {
  to_email: string;
  original_to: string | null;
  template: string;
  ticket_id: string | null;
  status: "sent" | "failed";
  error?: string | null;
}) {
  const { error } = await createAdminClient().from("email_log").insert({ ...row, error: row.error ?? null });
  if (error) console.error("[email] could not write email_log:", error.message);
}

/** Sends one email and records the attempt. Skips silently if SMTP isn't configured. */
export async function deliver(mail: OutgoingEmail): Promise<void> {
  const transport = getTransport();
  if (!transport) return;

  let to = mail.to.trim();
  let html = mail.html;
  let text = mail.text;
  let originalTo: string | null = null;

  // Demo accounts: send to the presenter's inbox instead, and say who it was meant for.
  const demoTo = process.env.DEMO_NOTIFY_EMAIL?.trim();
  if (demoTo && isDemoEmail(to, collegeEmailDomain())) {
    originalTo = to;
    const banner = `[Demo: originally to ${to}]`;
    text = `${banner}\n\n${text}`;
    const bar = `<div style="background:#fef3c7;color:#92400e;font:600 12px Arial,sans-serif;padding:8px 12px;text-align:center">${esc(banner)}</div>`;
    html = html.replace(/(<body[^>]*>)/i, (m) => `${m}${bar}`);
    to = demoTo;
  }

  const base = { to_email: to, original_to: originalTo, template: mail.template, ticket_id: mail.ticketId ?? null };
  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM?.trim() || process.env.SMTP_USER?.trim() || "CampusConnect <no-reply@zenithschool.ai>",
      to,
      subject: mail.subject,
      html,
      text,
    });
    await log({ ...base, status: "sent" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[email] send failed:", message);
    await log({ ...base, status: "failed", error: message.slice(0, 500) });
  }
}
