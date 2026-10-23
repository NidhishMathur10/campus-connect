export const ROLES = [
  "student",
  "staff",
  "warden",
  "dean",
  "hod",
  "teacher",
  "academic_office",
  "security_officer",
  "arc",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  student: "Student",
  staff: "Staff",
  warden: "Warden",
  dean: "Dean of Student Affairs",
  hod: "Head of Department",
  teacher: "Teacher",
  academic_office: "Academic Office",
  security_officer: "Security Officer",
  arc: "Anti-Ragging Committee",
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Where each role lands after login. */
export const ROLE_HOME: Record<Role, string> = {
  student: "/",
  staff: "/staff",
  academic_office: "/staff",
  security_officer: "/staff",
  arc: "/staff",
  warden: "/staff",
  dean: "/escalations",
  hod: "/escalations",
  teacher: "/faculty",
};

/**
 * Which roles may open which route prefixes. First match wins (longest prefixes first).
 * Routes not listed here are open to every signed-in user.
 */
export const ROUTE_ACCESS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/staff", roles: ["staff", "academic_office", "security_officer", "arc", "warden", "dean", "hod"] },
  { prefix: "/insights", roles: ["warden", "dean", "hod"] },
  { prefix: "/escalations", roles: ["warden", "dean", "hod"] },
  { prefix: "/email-log", roles: ["warden", "dean"] },
  { prefix: "/qa", roles: ["teacher", "academic_office", "hod", "dean"] },
  { prefix: "/faculty", roles: ["teacher"] },
  { prefix: "/answers", roles: ["teacher"] },
  { prefix: "/report", roles: ["teacher", "academic_office", "hod"] },
  { prefix: "/reports", roles: ["teacher", "academic_office", "hod"] },
  { prefix: "/hostel", roles: ["student"] },
  { prefix: "/education", roles: ["student"] },
  { prefix: "/safety", roles: ["student"] },
  { prefix: "/tickets", roles: ["student"] },
];

export function canAccess(role: Role, pathname: string): boolean {
  if (pathname === "/") return role === "student";
  const rule = ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return rule ? rule.roles.includes(role) : true;
}

/** Routes for signed-out users (signed-in users get sent to their home). */
export const PUBLIC_ROUTES = ["/login", "/signup"];

/** Routes anyone can open, signed in or not (prefix match). */
export const OPEN_ROUTES = ["/account-issue"];

/** Exact paths anyone can open, signed in or not ("/track" is public; "/track/CC-1001" needs login). */
export const OPEN_EXACT_ROUTES = ["/track"];
