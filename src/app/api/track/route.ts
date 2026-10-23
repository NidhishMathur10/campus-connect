import { NextResponse } from "next/server";
import { z } from "zod";
import { normaliseTicketNo } from "@/lib/format";
import { publicTrack, type PublicTrackResponse } from "@/lib/tickets/public-track";

/** Same message for a wrong number and a Safety & Security ticket. */
const NOT_FOUND = "Ticket not found. Check the ticket number.";

// Simple in-memory rate limit: 10 lookups per IP per 10 minutes (per server instance).
const WINDOW_MS = 10 * 60_000;
const MAX_LOOKUPS = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [key, times] of hits) if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
  }
  return recent.length > MAX_LOOKUPS;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

const BodySchema = z.object({ ticketNo: z.string().max(20) });

/** POST /api/track — public tracking by ticket number (no login). */
export async function POST(request: Request) {
  const reply = (body: PublicTrackResponse, status = 200) => NextResponse.json(body, { status });

  if (rateLimited(clientIp(request))) {
    return reply({ ok: false, error: "Too many lookups. Please wait a few minutes and try again." }, 429);
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  const ticketNo = parsed.success ? normaliseTicketNo(parsed.data.ticketNo) : null;
  if (!ticketNo) return reply({ ok: false, error: NOT_FOUND }, 404);

  const found = await publicTrack(ticketNo);
  if (!found) return reply({ ok: false, error: NOT_FOUND }, 404);
  return reply({ ok: true, ...found });
}
