import type { TicketModule } from "@/config/routing";
import type { Role } from "@/config/roles";
import type { Profile, Ticket } from "@/lib/types";

/**
 * Who may see / change which tickets on the staff side. Mirrors the RLS helpers
 * can_view_ticket() / can_manage_ticket() in supabase/schema.sql — keep them in sync.
 */
export type Viewer = Pick<Profile, "id" | "role" | "department">;
type TicketScopeFields = Pick<Ticket, "department" | "assigned_to" | "module">;

/** Roles that can assign, change status, merge, etc. */
export const MANAGER_ROLES: Role[] = ["staff", "academic_office", "warden"];
/** Roles that see the board but cannot change anything. */
export const READ_ONLY_ROLES: Role[] = ["dean", "hod"];
/** Roles that can be assigned a ticket. */
export const ASSIGNABLE_ROLES: Role[] = ["staff", "academic_office"];

export function canManageTicket(v: Viewer, t: TicketScopeFields): boolean {
  if (v.role === "staff" || v.role === "academic_office") {
    return (!!v.department && t.department === v.department) || t.assigned_to === v.id;
  }
  if (v.role === "warden") return t.module === "hostel";
  return false;
}

export function canViewStaffTicket(v: Viewer, t: TicketScopeFields): boolean {
  if (canManageTicket(v, t)) return true;
  if (v.role === "dean") return true;
  if (v.role === "hod") return t.module === "academic";
  return false;
}

/** Board query scope: a module restriction and/or a PostgREST `or` filter. Null = no board access. */
export function boardScope(v: Viewer): { module?: TicketModule; or?: string } | null {
  switch (v.role) {
    case "staff":
    case "academic_office":
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
