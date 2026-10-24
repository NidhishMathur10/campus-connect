import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { SportsDesk } from "@/components/sports/desk";
import { isSportsManager, SPORTS_VIEWER_ROLES } from "@/config/sports";
import { requireProfile } from "@/lib/auth";
import { loadDesk, runSportsWatcher } from "@/lib/sports/core";

export const metadata: Metadata = { title: "Sports equipment desk" };

/** Sports In-charge's desk: issue, return, reservations, overdue and inventory. Warden and Dean look but can't change. */
export default async function SportsDeskPage() {
  const profile = await requireProfile(SPORTS_VIEWER_ROLES);
  await runSportsWatcher();
  const data = await loadDesk();
  return (
    <div>
      <PageHeader
        eyebrow="Sports Complex"
        title="Sports equipment desk"
        description={isSportsManager(profile.role) ? "Issue reservations, take equipment back and keep the inventory up to date." : "Read-only view of the equipment desk."}
      />
      <SportsDesk data={data} canManage={isSportsManager(profile.role)} />
    </div>
  );
}
