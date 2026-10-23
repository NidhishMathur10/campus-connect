import "server-only";
import { z } from "zod";
import { COLLEGE_NAME } from "@/config/college";
import { generateStructured, type AiResult } from "./gemini";

/** CLAUDE.md §6.8 — hotspotInsight(hotspot) → one-line recommendation. */
export const HotspotInsightSchema = z.object({
  recommendation: z
    .string()
    .describe("ONE sentence (max 25 words): the concrete preventive action that would stop these complaints recurring"),
});

export interface HotspotContext {
  label: string;
  count: number;
  days: number;
  trend: "up" | "down" | "flat";
  tickets: { title: string; status: string; created_at: string }[];
}

export async function hotspotInsight(ctx: HotspotContext): Promise<AiResult<z.infer<typeof HotspotInsightSchema>>> {
  const list = ctx.tickets
    .slice(0, 10)
    .map((t) => `- ${t.title} (${t.status}, ${new Date(t.created_at).toDateString()})`)
    .join("\n");
  return generateStructured({
    schema: HotspotInsightSchema,
    system: "You advise a college hostel/academic administration on preventive maintenance. Be concrete and brief. No markdown.",
    prompt: `Hotspot at ${COLLEGE_NAME}: ${ctx.label}
${ctx.count} tickets in the last ${ctx.days} days (trend: ${ctx.trend}).
Tickets:
${list}

Recommend one preventive action (not another one-off repair).`,
    temperature: 0.3,
    timeoutMs: 15_000,
    fallback: { recommendation: `Schedule a full inspection of ${ctx.label} instead of one-off repairs.` },
  });
}
