import type { Metadata } from "next";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Hostel & Campus" };

export default function HostelPage() {
  return (
    <>
      <PageHeader
        eyebrow="Module 1"
        title="Hostel & Campus"
        description="Report a problem with your room, washroom, water, electricity, Wi-Fi, laundry, mess, gym or courts."
      />
      <ComingSoon
        phase={2}
        icon={Building2}
        what="Report form (text, building, floor, spot, machine ID, photo) → AI chat for missing details → preview card → duplicate check → ticket number."
      />
    </>
  );
}
