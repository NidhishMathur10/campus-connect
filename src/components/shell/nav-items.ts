import {
  BarChart3,
  GraduationCap,
  House,
  ClipboardPlus,
  LayoutDashboard,
  MessageSquareReply,
  MessagesSquare,
  ShieldCheck,
  Siren,
  Ticket,
  Building2,
  History,
  Mail,
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
  { href: "/safety", label: "Safety", icon: ShieldCheck },
  { href: "/tickets", label: "My Tickets", icon: Ticket },
];

const BOARD: NavItem = { href: "/staff", label: "Ticket Board", icon: LayoutDashboard };
const HISTORY: NavItem = { href: "/staff/history", label: "All Tickets", icon: History };
const INSIGHTS: NavItem = { href: "/insights", label: "Insights", icon: BarChart3 };
const ESCALATIONS: NavItem = { href: "/escalations", label: "Escalations", icon: Siren };
const EMAIL_LOG: NavItem = { href: "/email-log", label: "Email log", icon: Mail };
const QA: NavItem = { href: "/qa", label: "Q&A Board", icon: MessagesSquare };

const FACULTY_HOME: NavItem = { href: "/faculty", label: "Home", icon: House };
const REPORT: NavItem = { href: "/report", label: "Report an issue", icon: ClipboardPlus };
const MY_REPORTS: NavItem = { href: "/reports", label: "My Reports", icon: Ticket };
const MY_ANSWERS: NavItem = { href: "/answers", label: "My Answers", icon: MessageSquareReply };

/** Sidebar items for every non-student role (must agree with ROUTE_ACCESS in config/roles). */
export const STAFF_NAV: Record<Exclude<Role, "student">, NavItem[]> = {
  staff: [BOARD, HISTORY],
  academic_office: [BOARD, HISTORY, QA, REPORT, MY_REPORTS],
  security_officer: [BOARD, HISTORY],
  arc: [BOARD, HISTORY],
  warden: [BOARD, HISTORY, INSIGHTS, ESCALATIONS, EMAIL_LOG],
  dean: [ESCALATIONS, INSIGHTS, BOARD, HISTORY, QA, EMAIL_LOG],
  hod: [ESCALATIONS, INSIGHTS, BOARD, HISTORY, QA, REPORT, MY_REPORTS],
  teacher: [FACULTY_HOME, QA, REPORT, MY_REPORTS, MY_ANSWERS],
};

export function isActive(pathname: string, href: string, items?: NavItem[]): boolean {
  const matches = (h: string) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));
  if (!matches(href)) return false;
  // "/staff" shouldn't light up on "/staff/history" when that has its own item.
  return !items?.some((i) => i.href.length > href.length && i.href.startsWith(href) && matches(i.href));
}
