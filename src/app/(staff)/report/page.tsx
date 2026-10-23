import type { Metadata } from "next";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ReportFlow } from "@/components/report/report-flow";
import { Button } from "@/components/ui/button";
import { FACULTY_ROLES } from "@/config/faculty";
import { ACADEMIC_BUILDINGS } from "@/config/locations";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Report an issue" };

export default async function FacultyReportPage() {
  const profile = await requireProfile(FACULTY_ROLES);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Faculty"
        title="Report an issue"
        description="Projector, lab equipment, library, a records problem — or electricity, Wi-Fi and cleanliness in Blocks A–D. Mention if a class is affected and we'll prioritise it."
        actions={
          <Button variant="outline" asChild>
            <Link href="/reports"><Ticket /> My reports</Link>
          </Button>
        }
      />
      <ReportFlow
        module="academic"
        audience="faculty"
        userId={profile.id}
        buildings={ACADEMIC_BUILDINGS}
        textPlaceholder="Describe the problem — e.g. “Projector in C-204 is not working, I have a class at 2”"
      />
    </div>
  );
}
