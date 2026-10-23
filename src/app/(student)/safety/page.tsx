import type { Metadata } from "next";
import Link from "next/link";
import { Lock, Ticket } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SafetyReport } from "@/components/safety/safety-report";
import { Button } from "@/components/ui/button";
import { BUILDINGS } from "@/config/locations";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Report — Safety & Security" };

/** Safety reports can happen anywhere, not only inside a building. */
const SAFETY_LOCATIONS = [...BUILDINGS, "Elsewhere on campus"];

export default async function SafetyPage() {
  const profile = await requireProfile(["student"]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Safety & Security"
        title="Report a safety concern"
        description="Ragging, harassment, bullying, threats, theft or a suspicious person. You are not in trouble for speaking up."
        actions={
          <Button variant="outline" asChild>
            <Link href="/tickets"><Ticket /> My tickets</Link>
          </Button>
        }
      />
      <p className="mb-5 flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Lock className="mt-0.5 size-4 shrink-0 text-navy" />
        Ragging, harassment and threat reports are confidential: only you, the Anti-Ragging Committee or the assigned
        Security Officer, and the Dean of Student Affairs can see them. You can also hide your name from the
        investigating staff.
      </p>
      <SafetyReport userId={profile.id} buildings={SAFETY_LOCATIONS} />
    </div>
  );
}
