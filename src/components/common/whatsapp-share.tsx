"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Digits only, as wa.me wants it. Null if it doesn't look like an international number. */
function waNumber(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

/** Public tracking link. `appUrl` comes from APP_URL on the server; the browser origin is the fallback. */
export function trackLink(ticketNo: string, appUrl?: string): string {
  const base = (appUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");
  return `${base}/track?no=${encodeURIComponent(ticketNo)}`;
}

/**
 * "Share on WhatsApp" — a plain wa.me link, no API or account. Opens the app on mobile and
 * WhatsApp Web on desktop. With `phone` it opens that person's chat directly.
 * Renders nothing when `hidden` (confidential Safety tickets). Messages are built here, at click time,
 * so the track link can fall back to the browser origin.
 */
export function WhatsAppShareButton({
  ticket,
  kind = "share",
  note,
  phone,
  appUrl,
  hidden = false,
  className,
}: {
  ticket: { ticket_no: string; title?: string; status: string };
  /** "share" = ticket summary for anyone; "update" = staff status update to the reporter. */
  kind?: "share" | "update";
  /** Staff note for an "update" message. */
  note?: string | null;
  phone?: string | null;
  appUrl?: string;
  hidden?: boolean;
  className?: string;
}) {
  if (hidden) return null;
  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = `https://wa.me/${waNumber(phone) ?? ""}?text=${encodeURIComponent(
      kind === "update" ? staffUpdateMessage(ticket, note ?? null, appUrl) : ticketShareMessage({ ...ticket, title: ticket.title ?? "My complaint" }, appUrl),
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };
  return (
    <a
      href="https://wa.me/"
      onClick={open}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-full bg-whatsapp px-4 text-sm font-semibold text-whatsapp-fg shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <MessageCircle className="size-4" /> {kind === "update" ? "Send update on WhatsApp" : "Share on WhatsApp"}
    </a>
  );
}

function ticketShareMessage(t: { ticket_no: string; title: string; status: string }, appUrl?: string): string {
  return `CampusConnect ticket ${t.ticket_no}: ${t.title}\nStatus: ${t.status}\nTrack: ${trackLink(t.ticket_no, appUrl)}`;
}

function staffUpdateMessage(t: { ticket_no: string; status: string }, note: string | null, appUrl?: string): string {
  return [
    `Update on your ticket ${t.ticket_no}`,
    `Status: ${t.status}`,
    note?.trim() ? `Note: ${note.trim().slice(0, 200)}` : null,
    `Track: ${trackLink(t.ticket_no, appUrl)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
