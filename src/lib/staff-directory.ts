import "server-only";
import { AUTO_ASSIGN_ROLES } from "@/config/assignment";
import { SECURITY_DEPARTMENTS, type Department } from "@/config/routing";
import { getAssignmentSettings, type AssignmentSettings } from "@/lib/assignment";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DirectoryStaff {
  id: string;
  full_name: string;
  on_leave: boolean;
  preferred_buildings: string[];
  openTickets: number;
}

export interface DirectoryDepartment {
  department: string;
  autoAssign: boolean;
  staff: DirectoryStaff[];
}

/** Staff grouped by department for the warden / Dean. Safety departments are left out, and confidential tickets never count. */
export async function getStaffDirectory(): Promise<{ departments: DirectoryDepartment[]; settings: AssignmentSettings }> {
  const admin = createAdminClient();
  const [people, settings] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, department, on_leave, preferred_buildings")
      .in("role", [...AUTO_ASSIGN_ROLES])
      .order("full_name"),
    getAssignmentSettings(admin),
  ]);
  const staff = (people.data ?? []).filter((p) => p.department && !SECURITY_DEPARTMENTS.includes(p.department as Department));

  const { data: jobs } = await admin
    .from("tickets")
    .select("assigned_to")
    .in("assigned_to", staff.map((s) => s.id))
    .in("status", ["Assigned", "In Progress", "Reopened"])
    .eq("is_confidential", false);
  const open = new Map<string, number>();
  for (const j of jobs ?? []) open.set(j.assigned_to, (open.get(j.assigned_to) ?? 0) + 1);

  const groups = new Map<string, DirectoryStaff[]>();
  for (const p of staff) {
    groups.set(p.department!, [
      ...(groups.get(p.department!) ?? []),
      {
        id: p.id,
        full_name: p.full_name,
        on_leave: !!p.on_leave,
        preferred_buildings: p.preferred_buildings ?? [],
        openTickets: open.get(p.id) ?? 0,
      },
    ]);
  }
  return {
    settings,
    departments: [...groups.entries()].map(([department, members]) => ({
      department,
      autoAssign: !settings.disabledDepartments.includes(department),
      staff: members,
    })),
  };
}
