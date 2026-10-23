import {
  CircleHelp,
  Eye,
  HandMetal,
  PackageSearch,
  ShieldAlert,
  ShieldQuestion,
  UserX,
  ClipboardList,
  Droplet,
  Droplets,
  Dumbbell,
  DoorOpen,
  FlaskConical,
  Library,
  Presentation,
  SprayCan,
  Trophy,
  Utensils,
  WashingMachine,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Category, Priority } from "./routing";
import type { TicketStatus } from "./statuses";

export interface BadgeStyle {
  /** Tailwind classes for a soft badge (background + text + border). */
  className: string;
}

export interface CategoryStyle extends BadgeStyle {
  icon: LucideIcon;
}

export const CATEGORY_STYLES: Record<Category, CategoryStyle> = {
  Plumbing: { icon: Droplet, className: "bg-cat-plumbing-bg text-cat-plumbing-fg border-cat-plumbing-fg/30" },
  "Water Supply": { icon: Droplets, className: "bg-cat-water-bg text-cat-water-fg border-cat-water-fg/30" },
  Electricity: { icon: Zap, className: "bg-cat-electricity-bg text-cat-electricity-fg border-cat-electricity-fg/30" },
  Cleanliness: { icon: SprayCan, className: "bg-cat-cleanliness-bg text-cat-cleanliness-fg border-cat-cleanliness-fg/30" },
  Internet: { icon: Wifi, className: "bg-cat-internet-bg text-cat-internet-fg border-cat-internet-fg/30" },
  Laundry: { icon: WashingMachine, className: "bg-cat-laundry-bg text-cat-laundry-fg border-cat-laundry-fg/30" },
  "Room Repair": { icon: DoorOpen, className: "bg-cat-room-repair-bg text-cat-room-repair-fg border-cat-room-repair-fg/30" },
  Gym: { icon: Dumbbell, className: "bg-cat-gym-bg text-cat-gym-fg border-cat-gym-fg/30" },
  Sports: { icon: Trophy, className: "bg-cat-sports-bg text-cat-sports-fg border-cat-sports-fg/30" },
  "Mess Food": { icon: Utensils, className: "bg-cat-mess-bg text-cat-mess-fg border-cat-mess-fg/30" },
  "Classroom Facilities": { icon: Presentation, className: "bg-cat-classroom-bg text-cat-classroom-fg border-cat-classroom-fg/30" },
  "Lab Equipment": { icon: FlaskConical, className: "bg-cat-lab-bg text-cat-lab-fg border-cat-lab-fg/30" },
  "Academic Admin": { icon: ClipboardList, className: "bg-cat-academic-bg text-cat-academic-fg border-cat-academic-fg/30" },
  Library: { icon: Library, className: "bg-cat-library-bg text-cat-library-fg border-cat-library-fg/30" },
  Ragging: { icon: UserX, className: "bg-cat-ragging-bg text-cat-ragging-fg border-cat-ragging-fg/30" },
  "Harassment / Bullying": { icon: ShieldAlert, className: "bg-cat-harassment-bg text-cat-harassment-fg border-cat-harassment-fg/30" },
  "Threat / Fight / Violence": { icon: HandMetal, className: "bg-cat-threat-bg text-cat-threat-fg border-cat-threat-fg/30" },
  "Theft / Lost item": { icon: PackageSearch, className: "bg-cat-theft-bg text-cat-theft-fg border-cat-theft-fg/30" },
  "Unauthorized entry / Suspicious person": { icon: Eye, className: "bg-cat-suspicious-bg text-cat-suspicious-fg border-cat-suspicious-fg/30" },
  "Other safety concern": { icon: ShieldQuestion, className: "bg-cat-other-bg text-cat-other-fg border-cat-other-fg/30" },
  Other: { icon: CircleHelp, className: "bg-cat-other-bg text-cat-other-fg border-cat-other-fg/30" },
};

export function getCategoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLES[category as Category] ?? CATEGORY_STYLES.Other;
}

export const PRIORITY_STYLES: Record<Priority, BadgeStyle> = {
  Urgent: { className: "bg-prio-urgent-bg text-prio-urgent-fg border-prio-urgent-fg/30" },
  High: { className: "bg-prio-high-bg text-prio-high-fg border-prio-high-fg/30" },
  Medium: { className: "bg-prio-medium-bg text-prio-medium-fg border-prio-medium-fg/30" },
  Low: { className: "bg-prio-low-bg text-prio-low-fg border-prio-low-fg/30" },
};

export const STATUS_STYLES: Record<TicketStatus, BadgeStyle & { dot: string }> = {
  Submitted: { className: "bg-neutral-bg text-neutral-fg border-neutral-fg/30", dot: "bg-text-muted" },
  Assigned: { className: "bg-info-bg text-info-fg border-info-fg/30", dot: "bg-info-fg" },
  "In Progress": { className: "bg-violet-bg text-violet-fg border-violet-fg/30", dot: "bg-violet-fg" },
  Resolved: { className: "bg-success-bg text-success-fg border-success-fg/30", dot: "bg-success-fg" },
  Closed: { className: "bg-surface-inverse text-text-inverse border-text-muted/40", dot: "bg-text" },
  Reopened: { className: "bg-danger-bg text-danger-fg border-danger-fg/30", dot: "bg-danger-fg" },
  Merged: { className: "bg-neutral-bg text-neutral-fg border-neutral-fg/30", dot: "bg-text-muted" },
};
