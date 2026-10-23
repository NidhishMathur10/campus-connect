import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ReportItemFlow } from "@/components/lost-found/report-item";
import { LF_PLACES, LF_REPORTER_ROLES } from "@/config/lost-found";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Report — Lost & Found" };

type Params = { type?: string; title?: string; text?: string; building?: string; spot?: string };

/** The Safety module links here with the lost-item form pre-filled (?type=lost&text=…&building=…&spot=…). */
export default async function ReportLostFoundPage({ searchParams }: { searchParams: Promise<Params> }) {
  const profile = await requireProfile(LF_REPORTER_ROLES);
  const sp = await searchParams;
  const type = sp.type === "found" ? "found" : "lost";
  const building = (LF_PLACES as readonly string[]).includes(sp.building ?? "") ? (sp.building as string) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/lost-found" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Lost &amp; Found
      </Link>
      <PageHeader
        eyebrow="Lost & Found"
        title={type === "lost" ? "Report a lost item" : "Report a found item"}
        description="Describe it in your own words — English or Hindi. Add a photo if you can; it makes matching much better."
      />
      <ReportItemFlow
        userId={profile.id}
        prefill={{ type, text: (sp.text ?? sp.title ?? "").slice(0, 1500), building, spot: (sp.spot ?? "").slice(0, 120) }}
      />
    </div>
  );
}
