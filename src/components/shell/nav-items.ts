import {
  BarChart3,
  GraduationCap,
  House,
  LayoutDashboard,
  MessagesSquare,
  Siren,
  Ticket,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/config/roles";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const STUDENT_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/hostel", label: "Hostel", icon: Building2 },
  { href: "/education", label: "Education", icon: GraduationCap },
  { href: "/tickets", label: "My Tickets", icon: Ticket },
];

const BOARD: NavItem = { href: "/staff", label: "Ticket Board", icon: LayoutDashboard };
const INSIGHTS: NavItem = { href: "/insights", label: "Insights", icon: BarChart3 };
const ESCALATIONS: NavItem = { href: "/escalations", label: "Escalations", icon: Siren };
const QA: NavItem = { href: "/qa", label: "Q&A Board", icon: MessagesSquare };

/** Sidebar items for every non-student role (must agree with ROUTE_ACCESS in config/roles). */
export const STAFF_NAV: Record<Exclude<Role, "student">, NavItem[]> = {
  staff: [BOARD],
  academic_office: [BOARD, QA],
  warden: [BOARD, INSIGHTS, ESCALATIONS],
  dean: [ESCALATIONS, INSIGHTS, BOARD, QA],
  hod: [ESCALATIONS, INSIGHTS, BOARD, QA],
  teacher: [QA],
};

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
