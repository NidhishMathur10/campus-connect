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
  /** Short caption under the quick-login button. */
  caption: string;
  /** Seeded as a real account (for realistic data) but not shown as a quick-login button. */
  hidden?: boolean;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  // Students
  { loginId: "2616400101", rollNo: "2616400101", fullName: "Aarav Mehta", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "204", caption: "New Hostel · Room 204" },
  { loginId: "2616400102", rollNo: "2616400102", fullName: "Priya Singh", role: "student", hostel: "Old Hostel", wing: "Girls Wing", room: "G-108", caption: "Old Hostel · Girls Wing" },
  { loginId: "2616400103", rollNo: "2616400103", fullName: "Rahul Verma", role: "student", hostel: "Old Hostel", wing: "Boys Wing", room: "B-305", caption: "Old Hostel · Boys Wing" },
  // Aarav's roommate (same room 204) — for the roommate "Me too" demo
  { loginId: "2616400104", rollNo: "2616400104", fullName: "Kabir Khanna", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "204", caption: "New Hostel · Room 204 (Aarav's roommate)" },
  // Other New Hostel 2nd-floor students: they only exist to make the seeded floor-level water-pressure pattern realistic.
  { loginId: "2616400105", rollNo: "2616400105", fullName: "Vikram Joshi", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "207", caption: "New Hostel · Room 207", hidden: true },
  { loginId: "2616400106", rollNo: "2616400106", fullName: "Ishaan Gupta", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "212", caption: "New Hostel · Room 212", hidden: true },
  { loginId: "2616400107", rollNo: "2616400107", fullName: "Dev Malhotra", role: "student", hostel: "New Hostel", wing: "Boys Wing", room: "219", caption: "New Hostel · Room 219", hidden: true },
  // Department staff
  { loginId: "ramesh", fullName: "Ramesh", role: "staff", department: "Estate / Maintenance", caption: "Estate / Maintenance" },
  { loginId: "mahesh", fullName: "Mahesh", role: "staff", department: "Estate / Maintenance", caption: "Estate / Maintenance" },
  { loginId: "suresh", fullName: "Suresh", role: "staff", department: "Electrical Maintenance", caption: "Electrical" },
  { loginId: "dinesh", fullName: "Dinesh", role: "staff", department: "Electrical Maintenance", caption: "Electrical" },
  { loginId: "kamla", fullName: "Kamla", role: "staff", department: "Housekeeping", caption: "Housekeeping" },
  { loginId: "sunita", fullName: "Sunita", role: "staff", department: "Housekeeping", caption: "Housekeeping" },
  { loginId: "rohit", fullName: "Rohit", role: "staff", department: "IT Cell", caption: "IT Cell" },
  { loginId: "ankit", fullName: "Ankit", role: "staff", department: "IT Cell", caption: "IT Cell" },
  { loginId: "sharma", fullName: "Mr. Sharma", role: "staff", department: "Mess Committee", caption: "Mess Committee" },
  { loginId: "gupta", fullName: "Mr. Gupta", role: "staff", department: "Lab In-charge", caption: "Lab In-charge" },
  { loginId: "nair", fullName: "Ms. Nair", role: "staff", department: "Library Staff", caption: "Library Staff" },
  { loginId: "kapoor", fullName: "Mrs. Kapoor", role: "academic_office", department: "Academic Office", caption: "Academic Office" },
  // Safety & Security
  { loginId: "yadav", fullName: "Mr. Yadav – Security Officer", role: "security_officer", department: "Security Office", caption: "Security Office" },
  { loginId: "mehra", fullName: "Dr. Mehra – Anti-Ragging Committee Nodal Officer", role: "arc", department: "Anti-Ragging Committee", caption: "Anti-Ragging Committee" },
  // Admins
  { loginId: "rao", fullName: "Mr. Rao", role: "warden", department: "Warden (manual triage)", caption: "Warden" },
  { loginId: "iyer", fullName: "Dr. Iyer", role: "dean", caption: "Dean of Student Affairs" },
  { loginId: "banerjee", fullName: "Dr. Banerjee", role: "hod", caption: "Head of Department" },
  // Teachers
  { loginId: "das", fullName: "Prof. Das", role: "teacher", caption: "Teacher" },
  { loginId: "khan", fullName: "Prof. Khan", role: "teacher", caption: "Teacher" },
];

export const DEMO_GROUPS: { label: string; roles: Role[] }[] = [
  { label: "Students", roles: ["student"] },
  { label: "Staff", roles: ["staff", "academic_office"] },
  { label: "Safety & Security", roles: ["security_officer", "arc"] },
  { label: "Admins", roles: ["warden", "dean", "hod"] },
  { label: "Teachers", roles: ["teacher"] },
];
