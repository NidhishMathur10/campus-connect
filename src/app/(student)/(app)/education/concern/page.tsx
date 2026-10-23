import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ConcernForm } from "@/components/feedback/concern-form";
import { PageHeader } from "@/components/common/page-header";
import { requireProfile } from "@/lib/auth";
import { listTeachers } from "@/lib/doubts/queries";

export const metadata: Metadata = { title: "Report a concern" };

export default async function ConcernPage() {
  const profile = await requireProfile(["student"]);
  const teachers = (await listTeachers()).filter((t) => t.subjects.length > 0);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/education?tab=feedback" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Rate my teachers
      </Link>
      <PageHeader eyebrow="Education" title="Report a concern about a teacher" description="For unfair marking, irregular classes, disrespectful behaviour or discrimination. It is confidential and anonymous." />
      <ConcernForm userId={profile.id} teachers={teachers} />
    </div>
  );
}
