import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { ModuleTabs } from "@/components/common/module-tabs";
import { PageHeader } from "@/components/common/page-header";
import { hostelTabs } from "@/components/notices/module-tab-defs";
import { UrgentNotices } from "@/components/notices/urgent-notices";
import { ReportFlow } from "@/components/report/report-flow";
import { Button } from "@/components/ui/button";
import { BUILDINGS } from "@/config/locations";
import { requireProfile } from "@/lib/auth";
import { unreadNoticeCount } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Report — Hostel & Campus" };

export default async function HostelPage() {
  const profile = await requireProfile(["student"]);
  const unread = await unreadNoticeCount(profile, "hostel");

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Hostel & Campus"
        title="Report a problem"
        description="Your room, a common area, water, electricity, Wi-Fi, laundry, mess, gym or courts — describe it in your own words."
        actions={
          <Button variant="outline" asChild>
            <Link href="/tickets"><Ticket /> My tickets</Link>
          </Button>
        }
      />
      <ModuleTabs tabs={hostelTabs(unread)} active="report" />
      <UrgentNotices profile={profile} page="hostel" />
      <ReportFlow
        module="hostel"
        userId={profile.id}
        buildings={BUILDINGS}
        ownRoom={{ hostel: profile.hostel, room: profile.room }}
      />
    </div>
  );
}
