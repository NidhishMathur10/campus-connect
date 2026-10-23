import type { Metadata } from "next";
import { Ticket } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";

export const metadata: Metadata = { title: "My Tickets" };

export default function MyTicketsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Track"
        title="My Tickets"
        description="Everything you've reported (and joined with “Me too”), with live progress."
      />
      <ComingSoon
        phase={2}
        icon={Ticket}
        what="Ticket cards with a live vertical timeline, ticket detail, “Fixed? Yes / No, reopen”, 1–5 star rating, and track-by-ticket-number."
      />
    </>
  );
}
