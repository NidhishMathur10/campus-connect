import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { NoticeComposer } from "@/components/notices/notice-composer";
import { NOTICE_POSTER_ROLES, posterRule } from "@/config/notices";
import { requireProfile } from "@/lib/auth";
import { getNoticeForPoster } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Edit notice" };

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(NOTICE_POSTER_ROLES);
  const { id } = await params;
  const notice = await getNoticeForPoster(id);
  if (!notice || (notice.author_id !== profile.id && profile.role !== "dean")) notFound();
  // The Dean may edit anyone's notice; otherwise the author's own rules apply.
  const rule = posterRule(notice.author_id === profile.id ? profile.role : "dean")!;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Notice board" title="Edit notice" description="Changes show to students straight away. People already notified are not notified again." />
      <NoticeComposer userId={profile.id} rule={rule} teacherSubjects={profile.subjects ?? []} notice={notice} />
    </div>
  );
}
