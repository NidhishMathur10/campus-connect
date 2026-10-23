import type { Metadata } from "next";
import Link from "next/link";
import { PackageCheck, PackageSearch, ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { LostFoundBoard } from "@/components/lost-found/board";
import { Button } from "@/components/ui/button";
import { LF_ALL_ROLES, LF_REPORTER_ROLES, LF_STAFF_ROLES } from "@/config/lost-found";
import { requireProfile } from "@/lib/auth";
import { loadBoard } from "@/lib/lost-found/queries";

export const metadata: Metadata = { title: "Lost & Found" };

export default async function LostFoundPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await requireProfile(LF_ALL_ROLES);
  const { tab } = await searchParams;
  const data = await loadBoard({ id: profile.id, role: profile.role });
  const canReport = LF_REPORTER_ROLES.includes(profile.role);
  const initialTab = tab === "found" || tab === "mine" ? tab : "lost";

  return (
    <div>
      <PageHeader
        eyebrow="Lost & Found"
        title="Find it, or help someone find theirs"
        description="Post what you lost or found. We compare every post with the other side and tell you when something matches. Valuables stay private."
        actions={
          <>
            {canReport && (
              <>
                <Button asChild><Link href="/lost-found/report?type=lost"><PackageSearch /> I lost something</Link></Button>
                <Button asChild variant="outline"><Link href="/lost-found/report?type=found"><PackageCheck /> I found something</Link></Button>
              </>
            )}
            {LF_STAFF_ROLES.includes(profile.role) && (
              <Button asChild variant="outline"><Link href="/lost-found/desk"><ScanSearch /> Open the desk</Link></Button>
            )}
          </>
        }
      />
      <LostFoundBoard data={data} role={profile.role} initialTab={initialTab} />
    </div>
  );
}
