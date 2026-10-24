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
import { campusNow, DAY_NAMES, MEAL_LABELS, MEALS, MESS_BUILDING, messForStudent } from "@/config/mess";
import { requireProfile } from "@/lib/auth";
import { unreadNoticeCount } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Report — Hostel & Campus" };

export default async function HostelPage({ searchParams }: { searchParams: Promise<{ mess?: string }> }) {
  const profile = await requireProfile(["student"]);
  const unread = await unreadNoticeCount(profile, "hostel");

  // "Report a problem with this meal" on the Mess menu tab lands here with ?mess=<meal>.
  const { mess: mealParam } = await searchParams;
  const meal = MEALS.find((m) => m === mealParam);
  const myMess = messForStudent(profile.hostel, profile.wing);
  const prefill = meal
    ? {
        building: myMess ? MESS_BUILDING[myMess] : null,
        spot: MEAL_LABELS[meal],
        text: `Mess food problem — ${MEAL_LABELS[meal]} (${DAY_NAMES[campusNow().day]}): `,
      }
    : undefined;

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
        prefill={prefill}
        key={meal ?? "plain"}
      />
    </div>
  );
}
