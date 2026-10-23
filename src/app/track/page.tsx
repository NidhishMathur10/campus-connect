import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { PublicTrackCard } from "@/components/tickets/public-track-card";
import { COLLEGE_NAME } from "@/config/college";

export const metadata: Metadata = { title: "Track a ticket" };

/** Public tracking by ticket number — no login (CLAUDE.md §13). */
export default async function PublicTrackPage({ searchParams }: { searchParams: Promise<{ no?: string }> }) {
  const { no } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 shadow-sm">
          <Logo />
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-text">
            <ArrowLeft className="size-4" /> Log in
          </Link>
        </div>
      </div>
      <p className="eyebrow">{COLLEGE_NAME}</p>
      <h1 className="mt-1 mb-6 text-3xl font-extrabold tracking-tight text-text sm:text-4xl">Track a ticket</h1>
      <PublicTrackCard className="animate-slide-up" initialTicketNo={typeof no === "string" ? no.slice(0, 20) : undefined} />
      <p className="mt-4 text-center text-xs text-text-muted">
        Only the status and progress are shown here. Complaint details, photos and names stay private.
      </p>
    </main>
  );
}
