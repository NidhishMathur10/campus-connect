import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Insights" };

export default function InsightsPage() {
  return (
    <>
      <PageHeader eyebrow="Analytics" title="Insights" description="Recurring issues, hotspots and how fast things get fixed." />
      <ComingSoon
        phase={4}
        icon={BarChart3}
        what="Charts by category and building, average resolution time, average rating, and a Hotspots list with Gemini recommendations."
      />
    </>
  );
}
