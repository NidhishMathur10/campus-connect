import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AskTeacherForm } from "@/components/doubts/ask-form";
import { PageHeader } from "@/components/common/page-header";
import { requireProfile } from "@/lib/auth";
import { listTeachers, teachersBySubject } from "@/lib/doubts/queries";

export const metadata: Metadata = { title: "Ask my teacher" };

export default async function NewDoubtPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const profile = await requireProfile(["student"]);
  const { subject } = await searchParams;
  const map = teachersBySubject(await listTeachers());
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/education?tab=ask" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Ask my teacher
      </Link>
      <PageHeader eyebrow="Education" title="Ask my teacher" description="A private doubt goes only to the teacher of that subject. No audience, no judgement." />
      <AskTeacherForm userId={profile.id} teachersBySubject={map} initialSubject={subject ?? null} />
    </div>
  );
}
