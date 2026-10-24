import type { Metadata } from "next";
import { ModuleTabs } from "@/components/common/module-tabs";
import { PageHeader } from "@/components/common/page-header";
import { hostelTabs } from "@/components/notices/module-tab-defs";
import { NoticesView } from "@/components/notices/notices-view";
import { UrgentNotices } from "@/components/notices/urgent-notices";
import { requireProfile } from "@/lib/auth";
import { unreadNoticeCount } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Notices — Hostel & Campus" };

export default async function HostelNoticesPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const profile = await requireProfile(["student"]);
  const { n } = await searchParams;
  const unread = await unreadNoticeCount(profile, "hostel");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Hostel & Campus"
        title="Notices"
        description="Announcements, urgent alerts, known issues and events for your hostel and the campus."
      />
      <ModuleTabs tabs={hostelTabs(unread)} active="notices" />
      <UrgentNotices profile={profile} page="hostel" />
      <NoticesView profile={profile} page="hostel" highlightId={n} />
    </div>
  );
}
