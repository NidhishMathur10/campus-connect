"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Palmtree, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runSlaCheckNow, setStaffOnLeave } from "@/lib/assignment-actions";
import { cn } from "@/lib/utils";

/** Warden / Dean: runs the SLA watcher right now and refreshes the page. */
export function RunSlaCheckButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await runSlaCheckNow();
            if (!res.ok) return void toast.error(res.error);
            const s = res.summary;
            toast.success(
              s.reminders + s.reassigned + s.flagged + s.escalated === 0
                ? "SLA check done — nothing needed attention"
                : `SLA check done: ${s.reassigned} reassigned, ${s.escalated} escalated, ${s.reminders} reminder${s.reminders === 1 ? "" : "s"}, ${s.flagged} flagged`,
            );
            router.refresh();
          } catch {
            toast.error("Could not run the SLA check. Please try again.");
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <TimerReset />} Run SLA check now
    </Button>
  );
}

/** Staff: "I'm on leave" — new tickets skip you while it is on. */
export function OnLeaveToggle({ staffId, onLeave }: { staffId: string; onLeave: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={onLeave}
      disabled={pending}
      title="While on leave you are skipped when new tickets are auto-assigned"
      onClick={() =>
        startTransition(async () => {
          try {
            const res = await setStaffOnLeave(staffId, !onLeave);
            if (!res.ok) return void toast.error(res.error);
            toast.success(onLeave ? "Welcome back — you'll get new tickets again" : "You're on leave — new tickets will skip you");
            router.refresh();
          } catch {
            toast.error("Could not update. Please try again.");
          }
        })
      }
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-60",
        onLeave ? "border-warning-fg/30 bg-warning-bg text-warning-fg" : "border-border bg-surface text-text-muted hover:bg-surface-2",
      )}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Palmtree className="size-4" />}
      {onLeave ? "On leave — tap to return" : "I'm on leave"}
    </button>
  );
}
