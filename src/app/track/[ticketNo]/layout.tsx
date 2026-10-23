import { StaffShell } from "@/components/shell/staff-shell";
import { StudentShell } from "@/components/shell/student-shell";
import { ROLE_LABELS, type Role } from "@/config/roles";
import { requireProfile } from "@/lib/auth";

/** /track is open to every signed-in role, so pick the matching shell. */
export default async function TrackLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  if (profile.role === "student") {
    return (
      <StudentShell userId={profile.id} user={{ fullName: profile.full_name, roleLabel: `Roll ${profile.roll_no ?? ""}`, subtitle: null }}>
        {children}
      </StudentShell>
    );
  }
  const role = profile.role as Exclude<Role, "student">;
  return (
    <StaffShell
      role={role}
      user={{ fullName: profile.full_name, roleLabel: ROLE_LABELS[role], subtitle: profile.department ?? ROLE_LABELS[role] }}
    >
      {children}
    </StaffShell>
  );
}
