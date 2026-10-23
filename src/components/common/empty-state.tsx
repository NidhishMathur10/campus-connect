import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex animate-fade-in flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/70 px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-sky-tint text-accent-text">
        <Icon className="size-6" />
      </div>
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
