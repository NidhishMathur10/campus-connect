"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, CheckCircle2, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { acknowledgeEscalation, addDirective, resolveEscalation } from "@/lib/escalation-actions";
import type { EscalationStatus } from "@/lib/types";

async function postBrief(escalationId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/ai/escalation-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ escalationId }),
    });
    return (await res.json()) as { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

/** Writes missing AI briefs one by one (Gemini quota is small), then refreshes the page. */
export function BriefAutogen({ ids }: { ids: string[] }) {
  const router = useRouter();
  const started = useRef(false);
  const key = ids.join(",");
  useEffect(() => {
    if (!key || started.current) return;
    started.current = true;
    void (async () => {
      for (const id of key.split(",")) await postBrief(id);
      router.refresh();
    })();
  }, [key, router]);
  return null;
}

export function RegenerateBriefButton({ escalationId }: { escalationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        const res = await postBrief(escalationId);
        setPending(false);
        if (res.ok) toast.success("Brief updated");
        else toast.error(res.error ?? "Gemini is unavailable right now.");
        router.refresh();
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Regenerate with AI
    </Button>
  );
}

/** Dean / HOD controls: Acknowledge, Directive, Mark resolved. */
export function EscalationActions({
  escalationId,
  status,
  directive,
  allClosed,
  targetLabel,
}: {
  escalationId: string;
  status: EscalationStatus;
  directive: string | null;
  allClosed: boolean;
  targetLabel: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, fn: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusy(key);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (res.ok) toast.success(success);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-4">
      {status === "open" && (
        <Button className="w-full" onClick={() => run("ack", () => acknowledgeEscalation(escalationId), "Acknowledged")} disabled={!!busy}>
          {busy === "ack" ? <Loader2 className="animate-spin" /> : <CheckCheck />} Acknowledge
        </Button>
      )}

      {status !== "resolved" && (
        <div className="space-y-2">
          <p className="eyebrow">{directive ? "Update directive" : "Add directive"}</p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Estate to complete a full plumbing audit of the 2nd floor washroom by Friday; report back to me."
            maxLength={1000}
            className="min-h-24"
          />
          <p className="text-xs text-slate-500">
            Posted on every linked ticket as “Directive from {targetLabel}”, visible to staff and the students.
          </p>
          <Button
            variant="outline"
            className="w-full"
            disabled={text.trim().length < 5 || !!busy}
            onClick={() =>
              run(
                "directive",
                async () => {
                  const res = await addDirective(escalationId, text);
                  if (res.ok) setText("");
                  return res;
                },
                "Directive sent to staff and students",
              )
            }
          >
            {busy === "directive" ? <Loader2 className="animate-spin" /> : <Send />} Send directive
          </Button>
        </div>
      )}

      {status !== "resolved" && (
        <div className="space-y-1.5 border-t border-slate-100 pt-4">
          <Button
            variant="ghost"
            className="w-full text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            disabled={!allClosed || !!busy}
            onClick={() => run("resolve", () => resolveEscalation(escalationId), "Escalation resolved")}
          >
            {busy === "resolve" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Mark resolved
          </Button>
          {!allClosed && <p className="text-center text-xs text-slate-500">Available once every linked ticket is closed.</p>}
        </div>
      )}

      {status === "resolved" && (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
          <Sparkles className="size-4" /> Resolved — all linked tickets are closed.
        </p>
      )}
    </div>
  );
}
