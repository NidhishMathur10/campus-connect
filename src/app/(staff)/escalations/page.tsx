import type { Metadata } from "next";
import { Siren } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "Escalations" };

export default function EscalationsPage() {
  return (
    <>
      <PageHeader eyebrow="Needs attention" title="Escalations" description="Recurring problems, repeated reopens and missed deadlines, with an AI-written brief." />
      <ComingSoon
        phase={4}
        icon={Siren}
        what="Escalation list + detail with Gemini brief, recommended action, linked tickets, Acknowledge and Directive."
      />
    </>
  );
}
