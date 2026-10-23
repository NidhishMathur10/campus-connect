import type { Department } from "./routing";
import type { Role } from "./roles";

export const DEMO_PASSWORD = "demo1234";

export interface DemoAccount {
  /** Username typed on the login page: roll number for students, staff ID for others. */
  loginId: string;
  fullName: string;
  role: Role;
  department?: Department;
  rollNo?: string;
  hostel?: string;
  wing?: string;
  room?: string;
  /** Part before the "@" of the college email (domain: COLLEGE_EMAIL_DOMAIN). Students use their roll number. */
  emailLocal: string;
  /** Short caption under the quick-login button. */
  caption: string;
  /** Seeded as a real account (for realistic data) but not shown as a quick-login button. */
  hidden?: boolean;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  // Students
  { loginId: "2616400101", emailLocal: "2616400101", rollNo: "2616400101", fullName: "Aarav Mehta", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "204", caption: "New Hostel · Room 204" },
  { loginId: "2616400102", emailLocal: "2616400102", rollNo: "2616400102", fullName: "Priya Singh", role: "student", hostel: "Old Hostel", wing: "Girls Wing", room: "G-108", caption: "Old Hostel · Girls Wing" },
  { loginId: "2616400103", emailLocal: "2616400103", rollNo: "2616400103", fullName: "Rahul Verma", role: "student", hostel: "Old Hostel", wing: "Boys Wing", room: "B-305", caption: "Old Hostel · Boys Wing" },
  // Aarav's roommate (same room 204) — for the roommate "Me too" demo
  { loginId: "2616400104", emailLocal: "2616400104", rollNo: "2616400104", fullName: "Kabir Khanna", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "204", caption: "New Hostel · Room 204 (Aarav's roommate)" },
  // Other New Hostel 2nd-floor students: they only exist to make the seeded floor-level water-pressure pattern realistic.
  { loginId: "2616400105", emailLocal: "2616400105", rollNo: "2616400105", fullName: "Vikram Joshi", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "207", caption: "New Hostel · Room 207", hidden: true },
  { loginId: "2616400106", emailLocal: "2616400106", rollNo: "2616400106", fullName: "Ishaan Gupta", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "212", caption: "New Hostel · Room 212", hidden: true },
  { loginId: "2616400107", emailLocal: "2616400107", rollNo: "2616400107", fullName: "Dev Malhotra", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "219", caption: "New Hostel · Room 219", hidden: true },
  // Department staff
  { loginId: "ramesh", emailLocal: "ramesh", fullName: "Ramesh", role: "staff", department: "Estate / Maintenance", caption: "Estate / Maintenance" },
  { loginId: "mahesh", emailLocal: "mahesh", fullName: "Mahesh", role: "staff", department: "Estate / Maintenance", caption: "Estate / Maintenance" },
  { loginId: "suresh", emailLocal: "suresh", fullName: "Suresh", role: "staff", department: "Electrical Maintenance", caption: "Electrical" },
  { loginId: "dinesh", emailLocal: "dinesh", fullName: "Dinesh", role: "staff", department: "Electrical Maintenance", caption: "Electrical" },
  { loginId: "kamla", emailLocal: "kamla", fullName: "Kamla", role: "staff", department: "Housekeeping", caption: "Housekeeping" },
  { loginId: "sunita", emailLocal: "sunita", fullName: "Sunita", role: "staff", department: "Housekeeping", caption: "Housekeeping" },
  { loginId: "rohit", emailLocal: "rohit", fullName: "Rohit", role: "staff", department: "IT Cell", caption: "IT Cell" },
  { loginId: "ankit", emailLocal: "ankit", fullName: "Ankit", role: "staff", department: "IT Cell", caption: "IT Cell" },
  { loginId: "sharma", emailLocal: "mr.sharma", fullName: "Mr. Sharma", role: "staff", department: "Mess Committee", caption: "Mess Committee" },
  { loginId: "gupta", emailLocal: "mr.gupta", fullName: "Mr. Gupta", role: "staff", department: "Lab In-charge", caption: "Lab In-charge" },
  { loginId: "nair", emailLocal: "ms.nair", fullName: "Ms. Nair", role: "staff", department: "Library Staff", caption: "Library Staff" },
  { loginId: "kapoor", emailLocal: "mrs.kapoor", fullName: "Mrs. Kapoor", role: "academic_office", department: "Academic Office", caption: "Academic Office" },
  // Safety & Security
  { loginId: "yadav", emailLocal: "mr.yadav", fullName: "Mr. Yadav – Security Officer", role: "security_officer", department: "Security Office", caption: "Security Office" },
  { loginId: "mehra", emailLocal: "dr.mehra", fullName: "Dr. Mehra – Anti-Ragging Committee Nodal Officer", role: "arc", department: "Anti-Ragging Committee", caption: "Anti-Ragging Committee" },
  // Admins
  { loginId: "rao", emailLocal: "mr.rao", fullName: "Mr. Rao", role: "warden", department: "Warden (manual triage)", caption: "Warden" },
  { loginId: "iyer", emailLocal: "dr.iyer", fullName: "Dr. Iyer", role: "dean", caption: "Dean of Student Affairs" },
  { loginId: "banerjee", emailLocal: "dr.banerjee", fullName: "Dr. Banerjee", role: "hod", caption: "Head of Department" },
  // Teachers
  { loginId: "das", emailLocal: "prof.das", fullName: "Prof. Das", role: "teacher", caption: "Teacher" },
  { loginId: "khan", emailLocal: "prof.khan", fullName: "Prof. Khan", role: "teacher", caption: "Teacher" },
];

export const DEMO_GROUPS: { label: string; roles: Role[] }[] = [
  { label: "Students", roles: ["student"] },
  { label: "Staff", roles: ["staff", "academic_office"] },
  { label: "Safety & Security", roles: ["security_officer", "arc"] },
  { label: "Admins", roles: ["warden", "dean", "hod"] },
  { label: "Teachers", roles: ["teacher"] },
];

/** The college email of a demo account. */
export function demoAccountEmail(a: Pick<DemoAccount, "emailLocal">, domain: string): string {
  return `${a.emailLocal}@${domain}`.toLowerCase();
}

/** Is this one of the seeded demo accounts' addresses? (Their emails can be redirected to DEMO_NOTIFY_EMAIL.) */
export function isDemoEmail(email: string, domain: string): boolean {
  const e = email.trim().toLowerCase();
  return DEMO_ACCOUNTS.some((a) => demoAccountEmail(a, domain) === e);
}
