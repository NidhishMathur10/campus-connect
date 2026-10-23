import type { Metadata } from "next";
import { QuestionPage } from "@/components/qa/question-page";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Question — Q&A Board" };

export default async function StaffQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["teacher", "academic_office", "hod", "dean"]);
  const { id } = await params;
  return <QuestionPage id={id} profile={profile} backHref="/qa" />;
}
