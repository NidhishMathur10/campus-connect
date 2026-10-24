import { StaffShell } from "@/components/shell/staff-shell";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/config/roles";

const NON_STUDENT_ROLES: Exclude<Role, "student">[] = [
  "staff",
  "academic_office",
  "security_officer",
  "arc",
  "sports_incharge",
  "warden",
  "dean",
  "hod",
  "teacher",
];

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(NON_STUDENT_ROLES);
  const role = profile.role as Exclude<Role, "student">;

  return (
    <StaffShell
      role={role}
      userId={profile.id}
      user={{
        fullName: profile.full_name,
        roleLabel: ROLE_LABELS[role],
        subtitle: profile.department ?? ROLE_LABELS[role],
      }}
    >
      {children}
    </StaffShell>
  );
}
