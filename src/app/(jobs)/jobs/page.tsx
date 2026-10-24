import type { Metadata } from "next";
import { JobsList } from "@/components/jobs/jobs-list";
import { requireProfile } from "@/lib/auth";
import { ROLE_LABELS } from "@/config/roles";
import { getMyJobs } from "@/lib/jobs/queries";
import { runSlaWatcher } from "@/lib/sla-watcher";

export const metadata: Metadata = { title: "My Jobs" };

export default async function MyJobsPage() {
  const profile = await requireProfile(["staff", "security_officer"]);
  // Reminders / re-assignments for overdue tickets (throttled to once a minute, same as the board).
  await runSlaWatcher();
  const data = await getMyJobs(profile.id);

  return (
    <JobsList
      data={data}
      userId={profile.id}
      user={{ fullName: profile.full_name, roleLabel: ROLE_LABELS[profile.role], subtitle: profile.department ?? ROLE_LABELS[profile.role] }}
    />
  );
}
