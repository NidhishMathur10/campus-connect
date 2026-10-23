import type { Metadata } from "next";
import { QuestionPage } from "@/components/qa/question-page";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Question — Open Q&A" };

export default async function StudentQuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["student"]);
  const { id } = await params;
  return <QuestionPage id={id} profile={profile} backHref="/education?tab=qa" />;
}
