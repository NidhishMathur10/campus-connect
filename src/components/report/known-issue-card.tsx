"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2, Users, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { findKnownIssuesAction, followKnownIssue } from "@/lib/notices/actions";
import type { KnownIssueMatch } from "@/lib/notices/queries";

/**
 * Shown inside the complaint preview when an active known-issue notice covers the same category and place
 * (CLAUDE.md §23): "Me too (follow updates)" joins the notice's follower list; "My issue is different" hides it.
 */
export function KnownIssueCard({
  module,
  category,
  building,
  floor,
  hindi,
}: {
  module: "hostel" | "academic";
  category: string;
  building: string | null;
  floor: string | null;
  /** The student wrote in Hindi: show the Hindi title when there is one. */
  hindi?: boolean;
}) {
  const [matches, setMatches] = useState<KnownIssueMatch[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [followed, setFollowed] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    findKnownIssuesAction({ module, category, building, floor })
      .then((res) => {
        if (!cancelled) setMatches(res);
      })
      .catch(() => {
        if (!cancelled) setMatches([]); // never block a complaint on this check
      });
    return () => {
      cancelled = true;
    };
  }, [module, category, building, floor]);

  const shown = matches.filter((m) => !dismissed.includes(m.id));
  if (shown.length === 0) return null;

  function meToo(id: string) {
    setBusyId(id);
    start(async () => {
      const res = await followKnownIssue(id);
      setBusyId(null);
      if (res.ok) setFollowed((f) => [...f, id]);
      else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-3">
      {shown.map((m) => {
        const done = m.following || followed.includes(m.id);
        const title = (hindi && m.title_hi) || m.title;
        return (
          <div key={m.id} className="overflow-hidden rounded-2xl border border-warning-fg/30 bg-warning-bg">
            <div className="space-y-1 px-4 pt-4">
              <p className="eyebrow flex items-center gap-1.5 text-warning-fg">
                <Wrench className="size-3.5" /> Known issue
              </p>
              <p className="text-lg font-extrabold text-text">
                This is a known issue: {title}
                {m.expected_fix_at && <span className="text-warning-fg"> — expected fix {formatDateTime(m.expected_fix_at)}</span>}
              </p>
              {m.summary && <p className="text-sm text-text-muted">{m.summary}</p>}
            </div>
            <div className="px-4 pt-3 pb-4">
              {done ? (
                <p className="flex items-start gap-2 text-sm font-semibold text-success-fg">
                  <Check className="mt-0.5 size-4 shrink-0" />
                  <span>
                    You&apos;re following this issue — we&apos;ll notify you when it&apos;s fixed. No need to file a new ticket, but if your
                    problem is different you can still submit below.
                  </span>
                </p>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={() => meToo(m.id)} disabled={pending}>
                    {busyId === m.id ? <Loader2 className="animate-spin" /> : <Users />}
                    Me too (follow updates)
                  </Button>
                  <Button variant="outline" onClick={() => setDismissed((d) => [...d, m.id])} disabled={pending}>
                    My issue is different
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
