import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { DirectoryView } from "@/components/staff/directory-view";
import { RunSlaCheckButton } from "@/components/staff/sla-controls";
import { requireProfile } from "@/lib/auth";
import { runSlaWatcher } from "@/lib/sla-watcher";
import { getStaffDirectory } from "@/lib/staff-directory";

export const metadata: Metadata = { title: "Staff directory" };

export default async function DirectoryPage() {
  const profile = await requireProfile(["warden", "dean"]);
  await runSlaWatcher();
  const { departments, settings } = await getStaffDirectory();
  return (
    <>
      <PageHeader
        eyebrow="Auto-assignment"
        title="Staff directory"
        description="Who is available, how busy they are and which buildings they cover. New tickets go to available staff in the right department: preferred building first, then the fewest open jobs."
        actions={<RunSlaCheckButton />}
      />
      <DirectoryView departments={departments} settings={settings} isWarden={profile.role === "warden"} />
    </>
  );
}
