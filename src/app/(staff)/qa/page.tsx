import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Q&A Board" };

export default function TeacherQaPage() {
  return (
    <>
      <PageHeader eyebrow="Open Q&A" title="Q&A Board" description="Unanswered student questions first. You can see each author's roll number." />
      <ComingSoon
        phase={5}
        icon={MessagesSquare}
        what="Question list focused on unanswered questions, filters by subject, answer with a “Teacher” badge."
      />
    </>
  );
}
