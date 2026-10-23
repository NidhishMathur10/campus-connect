import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { AskQuestionForm } from "@/components/qa/ask-form";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Ask a question" };

export default async function AskQuestionPage() {
  await requireProfile(["student"]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Open Q&A"
        title="Ask a question"
        description="Teachers and classmates can answer. We check for similar questions while you type."
        actions={
          <Button variant="outline" asChild>
            <Link href="/education?tab=qa"><ArrowLeft /> All questions</Link>
          </Button>
        }
      />
      <AskQuestionForm basePath="/education/qa" />
    </div>
  );
}
