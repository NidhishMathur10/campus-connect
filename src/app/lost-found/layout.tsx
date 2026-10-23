import { StaffShell } from "@/components/shell/staff-shell";
import { StudentShell } from "@/components/shell/student-shell";
import { LF_ALL_ROLES } from "@/config/lost-found";
import { ROLE_LABELS, type Role } from "@/config/roles";
import { requireProfile } from "@/lib/auth";

/** Lost & Found is open to students (student shell) and faculty / security / warden (staff shell). */
export default async function LostFoundLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(LF_ALL_ROLES);
  if (profile.role === "student") {
    const subtitle = [profile.hostel, profile.wing, profile.room && `Room ${profile.room}`].filter(Boolean).join(" · ");
    return (
      <StudentShell
        userId={profile.id}
        user={{ fullName: profile.full_name, roleLabel: profile.roll_no ? `Roll ${profile.roll_no}` : "Student", subtitle: subtitle || null }}
      >
        {children}
      </StudentShell>
    );
  }
  const role = profile.role as Exclude<Role, "student">;
  return (
    <StaffShell
      role={role}
      userId={profile.id}
      user={{ fullName: profile.full_name, roleLabel: ROLE_LABELS[role], subtitle: profile.department ?? ROLE_LABELS[role] }}
    >
      {children}
    </StaffShell>
  );
}
