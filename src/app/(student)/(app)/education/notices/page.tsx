import type { Metadata } from "next";
import { ModuleTabs } from "@/components/common/module-tabs";
import { PageHeader } from "@/components/common/page-header";
import { educationTabs } from "@/components/notices/module-tab-defs";
import { NoticesView } from "@/components/notices/notices-view";
import { UrgentNotices } from "@/components/notices/urgent-notices";
import { requireProfile } from "@/lib/auth";
import { unreadNoticeCount } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Notices — Education" };

export default async function EducationNoticesPage({ searchParams }: { searchParams: Promise<{ n?: string }> }) {
  const profile = await requireProfile(["student"]);
  const { n } = await searchParams;
  const unread = await unreadNoticeCount(profile, "academic");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Education"
        title="Notices"
        description="Timetables, exam notices, class alerts and events from your teachers, HOD and the academic office."
      />
      <ModuleTabs tabs={educationTabs(unread)} active="notices" />
      <UrgentNotices profile={profile} page="academic" />
      <NoticesView profile={profile} page="academic" highlightId={n} />
    </div>
  );
}
