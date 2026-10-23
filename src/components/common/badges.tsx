import { Lock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryStyle, PRIORITY_STYLES, STATUS_STYLES } from "@/config/styles";
import type { Priority } from "@/config/routing";
import type { TicketStatus } from "@/config/statuses";

const base =
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.Low;
  return (
    <span className={cn(base, style.className, className)}>
      {priority === "Urgent" && <ShieldAlert className="size-3" />}
      {priority}
    </span>
  );
}

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const { icon: Icon, className: styleClass } = getCategoryStyle(category);
  return (
    <span className={cn(base, styleClass, className)}>
      <Icon className="size-3" />
      {category}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: TicketStatus; className?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.Submitted;
  return (
    <span className={cn(base, style.className, className)}>
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {status}
    </span>
  );
}

export function ConfidentialBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-slate-800 bg-slate-900 text-white", className)} title="Confidential safety report">
      <Lock className="size-3" />
      Confidential
    </span>
  );
}

export function EscalatedBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-red-600 bg-red-600 text-white", className)}>
      <ShieldAlert className="size-3" />
      Escalated
    </span>
  );
}
