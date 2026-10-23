import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { DoubtThreadView } from "@/components/doubts/thread-view";
import { requireProfile } from "@/lib/auth";
import { loadThread } from "@/lib/doubts/queries";

export const metadata: Metadata = { title: "My doubt" };

export default async function StudentDoubtPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile(["student"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const view = await loadThread(id, { id: profile.id, role: profile.role, subjects: [] });
  if (!view) notFound();
  return (
    <div>
      <Link href="/education?tab=ask" className="mx-auto mb-4 flex max-w-3xl items-center gap-1.5 text-sm font-semibold text-text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Ask my teacher
      </Link>
      <DoubtThreadView view={view} qaBasePath="/education/qa" />
    </div>
  );
}
