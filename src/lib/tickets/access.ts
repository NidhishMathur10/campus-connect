import type { TicketModule } from "@/config/routing";
import type { Role } from "@/config/roles";
import type { Profile, Ticket } from "@/lib/types";

/**
 * Who may see / change which tickets on the staff side. Mirrors the RLS helpers
 * can_view_ticket() / can_manage_ticket() in supabase/schema.sql — keep them in sync.
 */
export type Viewer = Pick<Profile, "id" | "role" | "department">;
type TicketScopeFields = Pick<Ticket, "department" | "assigned_to" | "module" | "is_confidential"> & Partial<Pick<Ticket, "teacher_complaint">>;

/** Department-bound roles: they work on their own department's tickets. */
const DEPARTMENT_ROLES: Role[] = ["staff", "academic_office", "security_officer", "arc"];
/** Roles that can assign, change status, merge, etc. */
export const MANAGER_ROLES: Role[] = [...DEPARTMENT_ROLES, "warden"];
/** Roles that see the board but cannot change anything. */
export const READ_ONLY_ROLES: Role[] = ["dean", "hod"];
/** Roles that can be assigned a ticket. */
export const ASSIGNABLE_ROLES: Role[] = DEPARTMENT_ROLES;

/**
 * Confidential safety reports: only the Anti-Ragging Committee (its own tickets) and
 * the ASSIGNED security officer may work on them (the Dean may read them).
 */
function confidentialAccess(v: Viewer, t: TicketScopeFields): boolean {
  if (v.role === "arc") return !!v.department && t.department === v.department;
  if (v.role === "security_officer") return t.assigned_to === v.id;
  return false;
}

export function canManageTicket(v: Viewer, t: TicketScopeFields): boolean {
  if (t.is_confidential) return confidentialAccess(v, t);
  if (DEPARTMENT_ROLES.includes(v.role)) {
    return (!!v.department && t.department === v.department) || t.assigned_to === v.id;
  }
  if (v.role === "warden") return t.module === "hostel";
  return false;
}

export function canViewStaffTicket(v: Viewer, t: TicketScopeFields): boolean {
  // Teacher concerns are never opened in the generic drawer (not even by the Dean): see /concerns.
  if (t.teacher_complaint) return false;
  if (canManageTicket(v, t)) return true;
  if (v.role === "dean") return true;
  if (v.role === "hod") return t.module === "academic" && !t.is_confidential;
  return false;
}

/** Manual "Escalate": warden → Dean (hostel); Academic Office (own tickets) or HOD → HOD (academic). */
export function canEscalateManually(v: Viewer, t: TicketScopeFields): boolean {
  if (t.is_confidential) return false;
  if (v.role === "warden") return t.module === "hostel";
  if (v.role === "hod") return t.module === "academic";
  if (v.role === "academic_office") return t.module === "academic" && canManageTicket(v, t);
  return false;
}

/** "Hide my name" safety reports: only the Anti-Ragging Committee and the Dean see the reporter. */
export function canSeeReporter(v: Viewer, t: Pick<Ticket, "hide_identity"> & Partial<Pick<Ticket, "teacher_complaint">>): boolean {
  if (t.teacher_complaint) return false;
  return !t.hide_identity || v.role === "arc" || v.role === "dean";
}

/** Board query scope: a module restriction and/or a PostgREST `or` filter. Null = no board access. */
export function boardScope(v: Viewer): { module?: TicketModule; or?: string } | null {
  switch (v.role) {
    case "staff":
    case "academic_office":
    case "security_officer":
    case "arc":
      // RLS additionally hides confidential tickets the viewer may not see.
      return {
        or: v.department
          ? `department.eq."${v.department}",assigned_to.eq.${v.id}`
          : `assigned_to.eq.${v.id}`,
      };
    case "warden":
      return { module: "hostel" };
    case "dean":
      return {};
    case "hod":
      return { module: "academic" };
    default:
      return null;
  }
}
