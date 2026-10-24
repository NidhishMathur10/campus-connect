import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { PosterRow } from "@/components/notices/poster-bits";
import { Button } from "@/components/ui/button";
import { NOTICE_POSTER_ROLES } from "@/config/notices";
import { requireProfile } from "@/lib/auth";
import { listNoticesForPoster, noticeStats } from "@/lib/notices/queries";

export const metadata: Metadata = { title: "Notices" };

export default async function PosterNoticesPage() {
  const profile = await requireProfile(NOTICE_POSTER_ROLES);
  const notices = await listNoticesForPoster();
  const stats = await noticeStats(notices);
  const mine = notices.filter((n) => n.author_id === profile.id);
  const others = notices.filter((n) => n.author_id !== profile.id);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Notice board"
        title="Notices"
        description="Post announcements, urgent alerts, known issues and events. See who has read them."
        actions={
          <Button asChild>
            <Link href="/notices/new"><Plus /> New notice</Link>
          </Button>
        }
      />

      {notices.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No notices yet"
          description="Write a rough note and let the AI turn it into a clear notice with a Hindi version."
          action={<Button asChild><Link href="/notices/new"><Plus /> New notice</Link></Button>}
        />
      ) : (
        <div className="space-y-8">
          {mine.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">Posted by you</h2>
              {mine.map((n) => <PosterRow key={n.id} notice={n} stats={stats.get(n.id)} mine />)}
            </section>
          )}
          {others.length > 0 && (
            <section className="space-y-3">
              <h2 className="eyebrow">Other notices you can see</h2>
              {others.map((n) => <PosterRow key={n.id} notice={n} stats={stats.get(n.id)} mine={false} />)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
