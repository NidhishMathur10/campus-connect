import type { Metadata } from "next";
import { ModuleTabs } from "@/components/common/module-tabs";
import { PageHeader } from "@/components/common/page-header";
import { hostelTabs } from "@/components/notices/module-tab-defs";
import { UrgentNotices } from "@/components/notices/urgent-notices";
import { EquipmentBrowser } from "@/components/sports/equipment-browser";
import { MyEquipment } from "@/components/sports/my-equipment";
import { LOAN_ACTIVE_STATUSES } from "@/config/sports";
import { requireProfile } from "@/lib/auth";
import { unreadNoticeCount } from "@/lib/notices/queries";
import { listItems, listMyLoans, reservationBlockUntil, runSportsWatcher } from "@/lib/sports/core";

export const metadata: Metadata = { title: "Sports equipment" };

export default async function SportsEquipmentPage() {
  const profile = await requireProfile(["student"]);
  await runSportsWatcher();
  const [unread, items, loans, blockedUntil] = await Promise.all([
    unreadNoticeCount(profile, "hostel"),
    listItems(),
    listMyLoans(profile.id),
    reservationBlockUntil(profile.id),
  ]);
  const heldQty = loans.filter((l) => LOAN_ACTIVE_STATUSES.includes(l.status)).reduce((n, l) => n + l.qty, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Hostel & Campus"
        title="Sports equipment"
        description="Reserve balls, rackets and more for a time slot, then show your pickup code at the Sports Complex counter."
      />
      <ModuleTabs tabs={hostelTabs(unread)} active="sports" />
      <UrgentNotices profile={profile} page="hostel" />
      <div className="space-y-10">
        {loans.length > 0 && <MyEquipment loans={loans} />}
        <section aria-labelledby="all-equipment" className="space-y-3">
          <h2 id="all-equipment" className="text-lg font-extrabold tracking-tight text-text">Available equipment</h2>
          <EquipmentBrowser items={items} heldQty={heldQty} blockedUntil={blockedUntil} />
        </section>
      </div>
    </div>
  );
}
