import "server-only";
import { z } from "zod";
import { COLLEGE_NAME } from "@/config/college";
import type { TicketModule } from "@/config/routing";
import type { EscalationReason } from "@/lib/types";
import { generateStructured, type AiResult } from "./gemini";

/** CLAUDE.md §6.7 — escalationBrief(context) → brief + recommended_action. */
export const EscalationBriefSchema = z.object({
  headline: z.string().describe("At most 10 words, plain English, e.g. 'Plumbing keeps failing in New Hostel 2nd floor washroom'"),
  brief: z
    .string()
    .describe("3-4 short lines: what is happening, for how long, how many students are affected, what has been tried so far"),
  recommended_action: z.string().describe("One or two sentences: the concrete decision or instruction the Dean/HOD should give"),
  urgency_reason: z.string().describe("One sentence: why this needs senior attention now"),
});
export type EscalationBrief = z.infer<typeof EscalationBriefSchema>;

export interface EscalationContext {
  module: TicketModule;
  reason: EscalationReason;
  targetLabel: string;
  /** e.g. "Plumbing · New Hostel, 2nd floor" */
  where: string;
  category: string;
  affectedCount: number;
  /** Warden/HOD's own words for manual escalations. */
  manualNote?: string | null;
  tickets: {
    ticket_no: string;
    title: string;
    summary: string | null;
    status: string;
    priority: string;
    created_at: string;
    sla_due_at: string | null;
    reopen_count: number;
    /** Staff actions and notes so far, oldest first. */
    history: string[];
  }[];
}

const REASON_TEXT: Record<EscalationReason, string> = {
  recurring: "the same kind of problem keeps being reported at the same place (3+ tickets in 30 days)",
  reopened: "the student has reopened the ticket at least twice — the fix is not holding",
  sla_breach: "an Urgent/High priority ticket has missed its resolution deadline",
  manual: "a senior staff member escalated it by hand",
};

function daysAgo(iso: string): string {
  const d = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Deterministic brief for when Gemini is unavailable. */
export function templateBrief(ctx: EscalationContext): EscalationBrief {
  const n = ctx.tickets.length;
  const oldest = ctx.tickets.reduce((a, t) => (t.created_at < a ? t.created_at : a), ctx.tickets[0]?.created_at ?? new Date().toISOString());
  const open = ctx.tickets.filter((t) => !["Resolved", "Closed", "Merged"].includes(t.status)).length;
  const headline =
    ctx.reason === "recurring"
      ? `Recurring ${ctx.category.toLowerCase()} problem at ${ctx.where.split(" · ")[1] ?? ctx.where}`
      : ctx.reason === "sla_breach"
        ? `${ctx.tickets[0]?.priority ?? "Urgent"} ticket past its deadline`
        : ctx.reason === "reopened"
          ? "Fix not holding — ticket reopened repeatedly"
          : `Escalated: ${ctx.tickets[0]?.title ?? ctx.category}`;
  return {
    headline,
    brief: [
      `${n} ${ctx.category} ticket${n === 1 ? "" : "s"} at ${ctx.where}, first reported ${daysAgo(oldest)}.`,
      `${ctx.affectedCount} student${ctx.affectedCount === 1 ? "" : "s"} affected; ${open} still open.`,
      ctx.manualNote ? `Escalation note: ${ctx.manualNote}` : `Escalated because ${REASON_TEXT[ctx.reason]}.`,
    ].join("\n"),
    recommended_action: "Review the linked tickets with the responsible department and set a firm deadline for a lasting fix.",
    urgency_reason: `Escalated because ${REASON_TEXT[ctx.reason]}.`,
  };
}

export async function escalationBrief(ctx: EscalationContext): Promise<AiResult<EscalationBrief>> {
  const tickets = ctx.tickets
    .slice(0, 8)
    .map(
      (t) =>
        `- ${t.ticket_no} (${t.status}, ${t.priority}, reported ${daysAgo(t.created_at)}${t.reopen_count ? `, reopened ${t.reopen_count}×` : ""}${
          t.sla_due_at ? `, deadline ${new Date(t.sla_due_at) < new Date() ? "MISSED" : "not yet due"}` : ""
        }): ${t.title}. ${t.summary ?? ""}\n  History: ${t.history.slice(-6).join(" | ") || "no staff action yet"}`,
    )
    .join("\n");

  const prompt = `An issue at ${COLLEGE_NAME} has been escalated to the ${ctx.targetLabel}.
Reason: ${REASON_TEXT[ctx.reason]}.
Module: ${ctx.module}. Category: ${ctx.category}. Location: ${ctx.where}.
Students affected (unique reporters + "me too" followers): ${ctx.affectedCount}.
${ctx.manualNote ? `Note from the person who escalated it: ${ctx.manualNote}\n` : ""}
Linked tickets:
${tickets}

Write a brief for a busy senior administrator. Be specific (use numbers, places, durations from the data). Do not invent facts that are not in the data.`;

  return generateStructured({
    schema: EscalationBriefSchema,
    system:
      "You write short, factual escalation briefs for college administrators. Plain English, no markdown, no greetings.",
    prompt,
    temperature: 0.3,
    timeoutMs: 25_000,
    fallback: templateBrief(ctx),
  });
}
