import type { LucideIcon } from "lucide-react";
import { Construction } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder body for screens built in a later phase (shows the real shell + skeletons). */
export function ComingSoon({
  phase,
  what,
  icon: Icon = Construction,
}: {
  phase: number;
  what: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="animate-slide-up space-y-6">
      <div className="flex items-start gap-4 rounded-3xl border border-sky-tint-2 bg-sky-tint p-5">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="eyebrow text-accent-text">Built in phase {phase}</p>
          <p className="mt-1 text-sm font-medium text-slate-700">{what}</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-3xl border border-border bg-card p-5">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
