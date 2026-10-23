import { StudentShell } from "@/components/shell/student-shell";
import { requireProfile } from "@/lib/auth";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile(["student"]);
  const subtitle = [profile.hostel, profile.wing, profile.room && `Room ${profile.room}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <StudentShell
      user={{
        fullName: profile.full_name,
        roleLabel: profile.roll_no ? `Roll ${profile.roll_no}` : "Student",
        subtitle: subtitle || null,
      }}
    >
      {children}
    </StudentShell>
  );
}
