import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ReportFlow } from "@/components/report/report-flow";
import { Button } from "@/components/ui/button";
import { BUILDINGS } from "@/config/locations";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Report — Hostel & Campus" };

export default async function HostelPage() {
  const profile = await requireProfile(["student"]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Hostel & Campus"
        title="Report a problem"
        description="Room, washroom, water, electricity, Wi-Fi, laundry, mess, gym or courts — describe it in your own words."
        actions={
          <Button variant="outline" asChild>
            <Link href="/tickets"><Ticket /> My tickets</Link>
          </Button>
        }
      />
      <ReportFlow module="hostel" userId={profile.id} buildings={BUILDINGS} />
    </div>
  );
}
