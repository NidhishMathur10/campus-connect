import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { LostFoundDesk } from "@/components/lost-found/desk";
import { isLfManager, LF_STAFF_ROLES } from "@/config/lost-found";
import { requireProfile } from "@/lib/auth";
import { loadDesk } from "@/lib/lost-found/queries";

export const metadata: Metadata = { title: "Lost & Found desk" };

/** Security Officer's desk: claims, suggested matches, items held at the office, 30-day expiry list. */
export default async function LostFoundDeskPage() {
  const profile = await requireProfile(LF_STAFF_ROLES);
  const data = await loadDesk({ id: profile.id, role: profile.role });
  return (
    <div>
      <Link href="/lost-found" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Lost &amp; Found
      </Link>
      <PageHeader
        eyebrow="Security Office"
        title="Lost & Found desk"
        description="Verify claims, confirm AI matches, hand items over and clear what nobody collected."
      />
      <LostFoundDesk data={data} canManage={isLfManager(profile.role)} />
    </div>
  );
}
