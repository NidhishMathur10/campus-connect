import { StudentShell } from "@/components/shell/student-shell";
import { getCurrentProfile } from "@/lib/auth";

/** Signed-in students get the app shell; signed-out visitors see the bare landing page at "/". */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const { userId, profile } = await getCurrentProfile();
  if (!userId) return children;
  if (!profile || profile.role !== "student") return children; // the page redirects
  const subtitle = [profile.hostel, profile.wing, profile.room && `Room ${profile.room}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <StudentShell
      userId={profile.id}
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
