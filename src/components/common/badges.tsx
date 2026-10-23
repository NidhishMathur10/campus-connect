import { Bot, Building, GraduationCap, Layers, Lock, PauseCircle, Repeat2, ShieldAlert, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryStyle, PRIORITY_STYLES, STATUS_STYLES } from "@/config/styles";
import type { TicketScope } from "@/config/locations";
import { ROLE_LABELS, type Role } from "@/config/roles";
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
    <span className={cn(base, "border-surface-inverse bg-surface-inverse text-text-inverse", className)} title="Confidential safety report">
      <Lock className="size-3" />
      Confidential
    </span>
  );
}

export function EscalatedBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-danger-solid bg-danger-solid text-danger-solid-fg", className)}>
      <ShieldAlert className="size-3" />
      Escalated
    </span>
  );
}

/** The system picked the assignee (auto-assignment). */
export function AutoAssignedBadge({ className }: { className?: string }) {
  return (
    <span className={cn(base, "border-violet-fg/30 bg-violet-bg text-violet-fg", className)} title="Assigned automatically">
      <Bot className="size-3" />
      Auto-assigned
    </span>
  );
}

/** The SLA watcher moved this ticket to another staff member after a missed deadline. */
export function ReassignedBadge({ count, className }: { count: number; className?: string }) {
  if (count < 1) return null;
  return (
    <span className={cn(base, "border-warning-fg/30 bg-warning-bg text-warning-fg", className)} title="Reassigned after a missed deadline">
      <Repeat2 className="size-3" />
      Reassigned{count > 1 ? ` ×${count}` : ""}
    </span>
  );
}

/** "Waiting for parts / external dependency": the SLA timer is paused. */
export function WaitingBadge({ reason, className }: { reason?: string | null; className?: string }) {
  return (
    <span className={cn(base, "border-neutral-fg/30 bg-neutral-bg text-neutral-fg", className)} title={reason ? `Waiting: ${reason}` : "Waiting for parts / external dependency"}>
      <PauseCircle className="size-3" />
      Waiting on parts
    </span>
  );
}

/** Hostel issues that reach beyond one room ("Affects whole floor"). Renders nothing for room-only tickets. */
export function ScopeBadge({ scope, className }: { scope: TicketScope | null | undefined; className?: string }) {
  if (scope !== "floor" && scope !== "building") return null;
  const Icon = scope === "floor" ? Layers : Building;
  return (
    <span className={cn(base, "border-info-fg/30 bg-info-bg text-info-fg", className)}>
      <Icon className="size-3" />
      {scope === "floor" ? "Affects whole floor" : "Affects whole building"}
    </span>
  );
}

/** "Reported by faculty": shown to staff on tickets raised by a teacher / HOD / academic office. */
export function FacultyBadge({
  reporter,
  compact = false,
  className,
}: {
  reporter: { name: string; role: Role } | null | undefined;
  /** Compact = just "Reported by faculty" (list rows); otherwise with name and role. */
  compact?: boolean;
  className?: string;
}) {
  if (!reporter) return null;
  return (
    <span
      className={cn(base, "max-w-full border-violet-fg/30 bg-violet-bg text-violet-fg", className)}
      title={`${reporter.name} (${ROLE_LABELS[reporter.role]})`}
    >
      <GraduationCap className="size-3 shrink-0" />
      <span className="truncate">
        Reported by faculty{compact ? "" : ` · ${reporter.name} (${ROLE_LABELS[reporter.role]})`}
      </span>
    </span>
  );
}

/** The AI was unavailable when this was reported, so the text / photo were not moderated. */
export function NotModeratedBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(base, "border-border bg-surface-2 text-text-muted", className)}
      title="The AI was unavailable, so this report's text and photo were not checked for abuse or unsuitable images"
    >
      <ShieldQuestion className="size-3" />
      Not moderated
    </span>
  );
}
