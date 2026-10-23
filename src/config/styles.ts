import {
  CircleHelp,
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
  Plumbing: { icon: Droplet, className: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  "Water Supply": { icon: Droplets, className: "bg-sky-50 text-sky-700 border-sky-200" },
  Electricity: { icon: Zap, className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  Cleanliness: { icon: SprayCan, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  Internet: { icon: Wifi, className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  Laundry: { icon: WashingMachine, className: "bg-teal-50 text-teal-700 border-teal-200" },
  "Room Repair": { icon: DoorOpen, className: "bg-orange-50 text-orange-700 border-orange-200" },
  Gym: { icon: Dumbbell, className: "bg-rose-50 text-rose-700 border-rose-200" },
  Sports: { icon: Trophy, className: "bg-lime-50 text-lime-700 border-lime-200" },
  "Mess Food": { icon: Utensils, className: "bg-amber-50 text-amber-700 border-amber-200" },
  "Classroom Facilities": { icon: Presentation, className: "bg-blue-50 text-blue-700 border-blue-200" },
  "Lab Equipment": { icon: FlaskConical, className: "bg-violet-50 text-violet-700 border-violet-200" },
  "Academic Admin": { icon: ClipboardList, className: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  Library: { icon: Library, className: "bg-purple-50 text-purple-700 border-purple-200" },
  Other: { icon: CircleHelp, className: "bg-slate-50 text-slate-700 border-slate-200" },
};

export function getCategoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLES[category as Category] ?? CATEGORY_STYLES.Other;
}

export const PRIORITY_STYLES: Record<Priority, BadgeStyle> = {
  Urgent: { className: "bg-red-100 text-red-700 border-red-200" },
  High: { className: "bg-orange-100 text-orange-700 border-orange-200" },
  Medium: { className: "bg-amber-100 text-amber-800 border-amber-200" },
  Low: { className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export const STATUS_STYLES: Record<TicketStatus, BadgeStyle & { dot: string }> = {
  Submitted: { className: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
  Assigned: { className: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  "In Progress": { className: "bg-violet-50 text-violet-700 border-violet-200", dot: "bg-violet-500" },
  Resolved: { className: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  Closed: { className: "bg-slate-800 text-white border-slate-800", dot: "bg-slate-800" },
  Reopened: { className: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  Merged: { className: "bg-zinc-100 text-zinc-500 border-zinc-200", dot: "bg-zinc-400" },
};
