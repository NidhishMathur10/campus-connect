import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Education" };

export default function EducationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Module 2"
        title="Education"
        description="Academic issues (classrooms, labs, library, academic office) and the open Q&A board."
      />
      <ComingSoon
        phase={5}
        icon={GraduationCap}
        what='Tabs: "Academic Issues" (same AI report & track flow with academic routing) and "Open Q&A" (ask with AI moderation + similar questions, answers, upvotes, best answer).'
      />
    </>
  );
}
