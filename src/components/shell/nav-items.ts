import {
  BarChart3,
  GraduationCap,
  House,
  ClipboardPlus,
  LayoutDashboard,
  MessageSquareReply,
  Inbox,
  BookUser,
  MessagesSquare,
  ShieldCheck,
  Siren,
  Ticket,
  Building2,
  History,
  Megaphone,
  Mail,
  PackageSearch,
  ScanSearch,
  ScrollText,
  Star,
  UsersRound,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/config/roles";

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile bottom bar. */
  shortLabel?: string;
  icon: LucideIcon;
}

export const STUDENT_NAV: NavItem[] = [
  { href: "/", label: "Home", icon: House },
  { href: "/hostel", label: "Hostel", icon: Building2 },
  { href: "/education", label: "Education", icon: GraduationCap },
  { href: "/safety", label: "Safety", icon: ShieldCheck },
  { href: "/tickets", label: "My Tickets", icon: Ticket },
  { href: "/lost-found", label: "Lost & Found", shortLabel: "Lost/Found", icon: PackageSearch },
];

const BOARD: NavItem = { href: "/staff", label: "Ticket Board", icon: LayoutDashboard };
const MY_JOBS: NavItem = { href: "/jobs", label: "My Jobs", icon: ClipboardCheck };
const ADVANCED: NavItem = { href: "/staff", label: "Advanced view", icon: LayoutDashboard };
const HISTORY: NavItem = { href: "/staff/history", label: "All Tickets", icon: History };
const INSIGHTS: NavItem = { href: "/insights", label: "Insights", icon: BarChart3 };
const ESCALATIONS: NavItem = { href: "/escalations", label: "Escalations", icon: Siren };
const EMAIL_LOG: NavItem = { href: "/email-log", label: "Notification log", icon: Mail };
const DIRECTORY: NavItem = { href: "/directory", label: "Staff directory", icon: UsersRound };
const LOST_FOUND: NavItem = { href: "/lost-found", label: "Lost & Found", icon: PackageSearch };
const LF_DESK: NavItem = { href: "/lost-found/desk", label: "Lost & Found desk", icon: ScanSearch };
const DOUBT_INBOX: NavItem = { href: "/doubts", label: "Doubt inbox", icon: Inbox };
const SUBJECTS: NavItem = { href: "/subjects", label: "Subject teachers", icon: BookUser };
const MY_FEEDBACK: NavItem = { href: "/feedback", label: "My feedback", icon: Star };
const TEACHER_FEEDBACK: NavItem = { href: "/teacher-feedback", label: "Teacher feedback", icon: Star };
const CONCERNS: NavItem = { href: "/concerns", label: "Teacher concerns", icon: ShieldCheck };
const AUDIT: NavItem = { href: "/audit", label: "Audit log", icon: ScrollText };
const NOTICES: NavItem = { href: "/notices", label: "Notices", icon: Megaphone };
const QA: NavItem = { href: "/qa", label: "Q&A Board", icon: MessagesSquare };

const FACULTY_HOME: NavItem = { href: "/faculty", label: "Home", icon: House };
const REPORT: NavItem = { href: "/report", label: "Report an issue", icon: ClipboardPlus };
const MY_REPORTS: NavItem = { href: "/reports", label: "My Reports", icon: Ticket };
const MY_ANSWERS: NavItem = { href: "/answers", label: "My Answers", icon: MessageSquareReply };

/** Sidebar items for every non-student role (must agree with ROUTE_ACCESS in config/roles). */
export const STAFF_NAV: Record<Exclude<Role, "student">, NavItem[]> = {
  staff: [MY_JOBS, ADVANCED, HISTORY],
  academic_office: [BOARD, HISTORY, NOTICES, QA, REPORT, MY_REPORTS, LOST_FOUND],
  security_officer: [MY_JOBS, ADVANCED, HISTORY, NOTICES, LOST_FOUND, LF_DESK],
  arc: [BOARD, HISTORY],
  warden: [BOARD, HISTORY, NOTICES, INSIGHTS, ESCALATIONS, DIRECTORY, SUBJECTS, LOST_FOUND, LF_DESK, EMAIL_LOG],
  dean: [ESCALATIONS, INSIGHTS, BOARD, HISTORY, NOTICES, DIRECTORY, QA, TEACHER_FEEDBACK, CONCERNS, AUDIT, EMAIL_LOG],
  hod: [ESCALATIONS, INSIGHTS, BOARD, HISTORY, NOTICES, QA, DOUBT_INBOX, TEACHER_FEEDBACK, CONCERNS, SUBJECTS, REPORT, MY_REPORTS, LOST_FOUND],
  teacher: [FACULTY_HOME, NOTICES, DOUBT_INBOX, QA, MY_FEEDBACK, REPORT, MY_REPORTS, MY_ANSWERS, LOST_FOUND],
};

export function isActive(pathname: string, href: string, items?: NavItem[]): boolean {
  const matches = (h: string) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`));
  if (!matches(href)) return false;
  // "/staff" shouldn't light up on "/staff/history" when that has its own item.
  return !items?.some((i) => i.href.length > href.length && i.href.startsWith(href) && matches(i.href));
}
