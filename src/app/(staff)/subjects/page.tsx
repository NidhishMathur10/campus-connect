import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { SubjectMapping } from "@/components/doubts/subject-mapping";
import { requireProfile } from "@/lib/auth";
import { listTeachers } from "@/lib/doubts/queries";

export const metadata: Metadata = { title: "Subject teachers" };

/** HOD / Academic Office (Dean: read-only): which subjects each teacher answers private doubts for ("Ask my teacher"). */
export default async function SubjectsPage() {
  const profile = await requireProfile(["hod", "academic_office", "dean"]);
  const teachers = await listTeachers();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Ask my teacher"
        title="Subject teachers"
        description="Choose the subjects each teacher answers. Students see these teachers when they ask a private doubt. A subject can have more than one teacher."
      />
      <SubjectMapping teachers={teachers} readOnly={profile.role === "dean"} />
    </div>
  );
}
