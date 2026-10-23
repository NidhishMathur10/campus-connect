export const MODULES = ["hostel", "academic", "security"] as const;
export type TicketModule = (typeof MODULES)[number];

export const MODULE_LABELS: Record<TicketModule, string> = {
  hostel: "Hostel & Campus",
  academic: "Education",
  security: "Safety & Security",
};

export const PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Max SLA per priority. Urgent (safety hazard) always wins with 2h. */
export const PRIORITY_SLA_HOURS: Record<Priority, number> = {
  Urgent: 2,
  High: 4,
  Medium: 24,
  Low: 72,
};

export const DEPARTMENTS = [
  "Estate / Maintenance",
  "Electrical Maintenance",
  "Housekeeping",
  "IT Cell",
  "Mess Committee",
  "Warden (manual triage)",
  "Lab In-charge",
  "Library Staff",
  "Academic Office",
  "Anti-Ragging Committee",
  "Security Office",
] as const;
export type Department = (typeof DEPARTMENTS)[number];

/** "Other" hostel tickets land here until the warden picks a real department. */
export const TRIAGE_DEPARTMENT: Department = "Warden (manual triage)";

export const HOSTEL_CATEGORIES = [
  "Plumbing",
  "Water Supply",
  "Electricity",
  "Cleanliness",
  "Internet",
  "Laundry",
  "Room Repair",
  "Gym",
  "Sports",
  "Mess Food",
  "Other",
] as const;
export type HostelCategory = (typeof HOSTEL_CATEGORIES)[number];

export const ACADEMIC_CATEGORIES = [
  "Classroom Facilities",
  "Lab Equipment",
  "Academic Admin",
  "Library",
  "Other",
] as const;
export type AcademicCategory = (typeof ACADEMIC_CATEGORIES)[number];

export const SECURITY_CATEGORIES = [
  "Ragging",
  "Harassment / Bullying",
  "Threat / Fight / Violence",
  "Theft / Lost item",
  "Unauthorized entry / Suspicious person",
  "Other safety concern",
] as const;
export type SecurityCategory = (typeof SECURITY_CATEGORIES)[number];

export type Category = HostelCategory | AcademicCategory | SecurityCategory;

export interface RoutingRule {
  category: Category;
  typicalIssues: string;
  /** First entry is the default department; extra entries are allowed alternatives. */
  departments: Department[];
  departmentNote?: string;
  defaultPriority: Priority;
  slaHours: number;
  /** Details the AI must collect for this category (besides building/floor/spot). */
  requiredDetails?: string;
  /** Safety & Security only: is the report confidential (always / never / student decides)? */
  confidential?: "always" | "never" | "choose";
  /** Safety & Security only: escalate to the Dean as soon as it is created. */
  escalateToDean?: boolean;
}

export const HOSTEL_ROUTING: RoutingRule[] = [
  { category: "Plumbing", typicalIssues: "leaks, taps, flush, drainage", departments: ["Estate / Maintenance"], defaultPriority: "Medium", slaHours: 24, requiredDetails: "what exactly is happening and how severe it is" },
  { category: "Water Supply", typicalIssues: "no water, low pressure, geyser, water cooler/RO", departments: ["Estate / Maintenance"], defaultPriority: "High", slaHours: 4, requiredDetails: "what exactly is happening and how severe it is" },
  { category: "Electricity", typicalIssues: "lights, fans, sockets, switches, power cut, AC", departments: ["Electrical Maintenance"], defaultPriority: "Medium", slaHours: 24, requiredDetails: "which item is faulty and whether there is any sparking" },
  { category: "Cleanliness", typicalIssues: "washrooms, garbage, corridors, pests", departments: ["Housekeeping"], defaultPriority: "Medium", slaHours: 24 },
  { category: "Internet", typicalIssues: "Wi-Fi down/slow, login, LAN port", departments: ["IT Cell"], defaultPriority: "Medium", slaHours: 24, requiredDetails: "Wi-Fi or LAN, and whether it is just them or the whole floor" },
  { category: "Laundry", typicalIssues: "washing machines", departments: ["Estate / Maintenance"], defaultPriority: "Low", slaHours: 72, requiredDetails: "the washing machine ID" },
  { category: "Room Repair", typicalIssues: "door, bed, cupboard, window, lock", departments: ["Estate / Maintenance"], defaultPriority: "Medium", slaHours: 24 },
  { category: "Gym", typicalIssues: "gym equipment/facility", departments: ["Estate / Maintenance"], defaultPriority: "Low", slaHours: 72 },
  { category: "Sports", typicalIssues: "courts, sports material", departments: ["Estate / Maintenance"], defaultPriority: "Low", slaHours: 72 },
  { category: "Mess Food", typicalIssues: "quality, quantity, hygiene of food", departments: ["Mess Committee"], defaultPriority: "Medium", slaHours: 24, requiredDetails: "which mess and which meal" },
  { category: "Other", typicalIssues: "unclear / doesn't fit", departments: ["Warden (manual triage)"], defaultPriority: "Low", slaHours: 72 },
];

export const ACADEMIC_ROUTING: RoutingRule[] = [
  { category: "Classroom Facilities", typicalIssues: "projector, smart board, AC, benches, mic in Blocks A–D", departments: ["Electrical Maintenance", "Estate / Maintenance"], departmentNote: "Electrical Maintenance for electrical items; Estate / Maintenance for furniture", defaultPriority: "Medium", slaHours: 24 },
  { category: "Lab Equipment", typicalIssues: "computers, software missing", departments: ["Lab In-charge"], defaultPriority: "Medium", slaHours: 24 },
  { category: "Academic Admin", typicalIssues: "timetable clash, attendance error, exam/marks issue", departments: ["Academic Office"], defaultPriority: "Medium", slaHours: 48 },
  { category: "Library", typicalIssues: "book unavailable, seating, library facilities", departments: ["Library Staff"], defaultPriority: "Low", slaHours: 72 },
  { category: "Other", typicalIssues: "—", departments: ["Academic Office"], defaultPriority: "Low", slaHours: 72 },
];

export const SECURITY_ROUTING: RoutingRule[] = [
  { category: "Ragging", typicalIssues: "seniors forcing, humiliating or intimidating juniors", departments: ["Anti-Ragging Committee"], defaultPriority: "Urgent", slaHours: 2, confidential: "always", escalateToDean: true },
  { category: "Harassment / Bullying", typicalIssues: "repeated teasing, threats, sexual or online harassment, bullying", departments: ["Anti-Ragging Committee"], defaultPriority: "Urgent", slaHours: 2, confidential: "always", escalateToDean: true },
  { category: "Threat / Fight / Violence", typicalIssues: "physical fights, assault, threats of violence", departments: ["Security Office"], defaultPriority: "Urgent", slaHours: 2, confidential: "always", escalateToDean: true },
  { category: "Theft / Lost item", typicalIssues: "stolen or lost phone, laptop, bicycle, wallet", departments: ["Security Office"], defaultPriority: "Medium", slaHours: 24, confidential: "never" },
  { category: "Unauthorized entry / Suspicious person", typicalIssues: "outsiders in the hostel, someone loitering, forced doors", departments: ["Security Office"], defaultPriority: "High", slaHours: 4, confidential: "never" },
  { category: "Other safety concern", typicalIssues: "any other safety worry", departments: ["Security Office"], defaultPriority: "Medium", slaHours: 24, confidential: "choose" },
];

export const ROUTING: Record<TicketModule, RoutingRule[]> = {
  hostel: HOSTEL_ROUTING,
  academic: ACADEMIC_ROUTING,
  security: SECURITY_ROUTING,
};

/** Departments that handle Safety & Security tickets (confidential work stays inside them). */
export const SECURITY_DEPARTMENTS: Department[] = ["Anti-Ragging Committee", "Security Office"];

/** Is a security ticket of this category confidential? (`choice` = the student's toggle for "choose"). */
export function isConfidentialCategory(category: string, choice = false): boolean {
  const rule = SECURITY_ROUTING.find((r) => r.category === category);
  if (!rule) return false;
  return rule.confidential === "always" || (rule.confidential === "choose" && choice);
}

export const SAFETY_HAZARDS =
  "sparking, exposed wires, flooding near electricals, gas smell, fire risk, injury risk";

export function categoriesFor(module: TicketModule): readonly Category[] {
  return module === "hostel" ? HOSTEL_CATEGORIES : module === "academic" ? ACADEMIC_CATEGORIES : SECURITY_CATEGORIES;
}

export function getRoutingRule(module: TicketModule, category: string): RoutingRule {
  const rules = ROUTING[module];
  return rules.find((r) => r.category === category) ?? rules[rules.length - 1];
}

/** SLA = the stricter of the category SLA and the priority SLA. */
export function getSlaHours(module: TicketModule, category: string, priority: Priority): number {
  return Math.min(getRoutingRule(module, category).slaHours, PRIORITY_SLA_HOURS[priority]);
}

export function computeSlaDueAt(
  module: TicketModule,
  category: string,
  priority: Priority,
  from: Date = new Date(),
): Date {
  return new Date(from.getTime() + getSlaHours(module, category, priority) * 3600_000);
}

/** Routing guide as a markdown table for AI prompts. */
export function routingGuidePromptText(module: TicketModule): string {
  const rows = ROUTING[module]
    .map(
      (r) =>
        `| ${r.category} | ${r.typicalIssues} | ${r.departmentNote ?? r.departments.join(" / ")} | ${r.defaultPriority} | ${r.slaHours}h |`,
    )
    .join("\n");
  const table = `| Category | Typical issues | Department | Default priority | SLA |\n|---|---|---|---|---|\n${rows}`;
  if (module === "security") return table;
  return `${table}\n\nPriority rule: Urgent (SLA 2h) overrides any category for safety hazards — ${SAFETY_HAZARDS}.`;
}
