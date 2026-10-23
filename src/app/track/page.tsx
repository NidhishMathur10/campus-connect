import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PublicTrackCard } from "@/components/tickets/public-track-card";
import { COLLEGE_NAME } from "@/config/college";

export const metadata: Metadata = { title: "Track a ticket" };

/** Public tracking by ticket number — no login (CLAUDE.md §13). */
export default function PublicTrackPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8 sm:py-12">
      <div className="mb-8 flex items-center justify-between gap-3">
        <Link href="/login" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
          <Logo />
        </Link>
        <Link href="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-navy">
          <ArrowLeft className="size-4" /> Log in
        </Link>
      </div>
      <p className="eyebrow">{COLLEGE_NAME}</p>
      <h1 className="mt-1 mb-6 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">Track a ticket</h1>
      <PublicTrackCard className="animate-slide-up" />
      <p className="mt-4 text-center text-xs text-slate-500">
        Only the status and progress are shown here. Complaint details, photos and names stay private.
      </p>
    </main>
  );
}
