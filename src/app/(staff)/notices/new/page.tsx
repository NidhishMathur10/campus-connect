import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { NoticeComposer } from "@/components/notices/notice-composer";
import { NOTICE_POSTER_ROLES, posterRule } from "@/config/notices";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "New notice" };

export default async function NewNoticePage() {
  const profile = await requireProfile(NOTICE_POSTER_ROLES);
  const rule = posterRule(profile.role)!;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Notice board" title="New notice" description="Write it roughly, improve it with AI, check it, then publish." />
      <NoticeComposer userId={profile.id} rule={rule} teacherSubjects={profile.subjects ?? []} />
    </div>
  );
}
