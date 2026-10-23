"use client";

import type { ModerateResponse } from "@/app/api/ai/moderate/route";

/**
 * Asks /api/ai/moderate before posting. Returns the polite reason when blocked, or null
 * when the post may go ahead (including when the check itself fails — the post action
 * moderates again on the server and marks it "pending review" if Gemini is down).
 */
export async function moderationBlockReason(body: {
  kind: "question" | "answer" | "comment";
  text: string;
  title?: string;
  context?: string;
}): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("/api/ai/moderate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = (await res.json()) as ModerateResponse;
    return data.ok && !data.allowed ? data.reason : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
