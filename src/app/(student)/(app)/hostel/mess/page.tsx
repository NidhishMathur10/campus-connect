import type { Metadata } from "next";
import { MessMenuView } from "@/components/mess/mess-menu-view";
import { ModuleTabs } from "@/components/common/module-tabs";
import { PageHeader } from "@/components/common/page-header";
import { hostelTabs } from "@/components/notices/module-tab-defs";
import { UrgentNotices } from "@/components/notices/urgent-notices";
import { campusNow, MESS_LABELS, messForStudent } from "@/config/mess";
import { requireProfile } from "@/lib/auth";
import { loadMenu, myRatingsFor } from "@/lib/mess/core";
import { unreadNoticeCount } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Mess menu" };

export default async function MessMenuPage() {
  const profile = await requireProfile(["student"]);
  const mess = messForStudent(profile.hostel, profile.wing);
  const now = new Date();
  const [unread, menu, mine] = await Promise.all([
    unreadNoticeCount(profile, "hostel"),
    loadMenu(mess ?? "all"),
    myRatingsFor(profile.id, campusNow(now).date),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader eyebrow="Hostel & Campus" title="Mess menu" description="This week's menu, serving times, and a way to rate each meal or report a problem with it." />
      <ModuleTabs tabs={hostelTabs(unread)} active="mess" />
      <UrgentNotices profile={profile} page="hostel" />
      <MessMenuView menu={menu} messLabel={mess ? MESS_LABELS[mess] : "Hostel mess"} nowIso={now.toISOString()} myRatings={mine} canRate />
    </div>
  );
}
