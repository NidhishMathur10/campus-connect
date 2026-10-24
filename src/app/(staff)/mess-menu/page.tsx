import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3, Pencil } from "lucide-react";
import { ModuleTabs } from "@/components/common/module-tabs";
import { PageHeader } from "@/components/common/page-header";
import { MenuEditor } from "@/components/mess/menu-editor";
import { RatingsDashboardView } from "@/components/mess/ratings-dashboard";
import { canViewMessRatings, isMessManager } from "@/config/mess";
import { ROLE_HOME } from "@/config/roles";
import { requireProfile } from "@/lib/auth";
import { loadMenu, loadRatingsDashboard } from "@/lib/mess/core";

export const metadata: Metadata = { title: "Mess menu" };

/** Mess Committee: edit the shared menu and timings, read meal ratings. Warden sees ratings only. */
export default async function MessMenuAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const profile = await requireProfile(["staff", "warden", "dean"]);
  if (!canViewMessRatings(profile.role, profile.department)) redirect(`${ROLE_HOME[profile.role]}?denied=1`);
  const manager = isMessManager(profile.role, profile.department);
  const { tab } = await searchParams;
  const active = manager && tab !== "ratings" ? "menu" : "ratings";
  const menu = await loadMenu("all");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Mess Committee"
        title="Mess menu"
        description={manager ? "Keep the weekly menu and serving times up to date, and see how students rate each meal." : "How students rate the mess meals (read-only)."}
      />
      {manager && (
        <ModuleTabs
          active={active}
          tabs={[
            { value: "menu", label: "Edit menu", icon: Pencil, href: "/mess-menu" },
            { value: "ratings", label: "Ratings", icon: BarChart3, href: "/mess-menu?tab=ratings" },
          ]}
        />
      )}
      {active === "menu" ? <MenuEditor menu={menu} /> : <RatingsDashboardView data={await loadRatingsDashboard(menu)} />}
    </div>
  );
}
