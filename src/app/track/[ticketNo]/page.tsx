import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { TrackedTicketView } from "@/components/tickets/ticket-detail";
import { TrackBox } from "@/components/tickets/track-box";
import { requireProfile } from "@/lib/auth";
import { normaliseTicketNo } from "@/lib/format";
import { trackTicket } from "@/lib/tickets/queries";

export const metadata: Metadata = { title: "Track ticket" };

/** Track by ticket number for any signed-in user (basic status + timeline). */
export default async function TrackPage({ params }: { params: Promise<{ ticketNo: string }> }) {
  const profile = await requireProfile();
  const { ticketNo: raw } = await params;
  const ticketNo = normaliseTicketNo(raw);
  if (profile.role === "student" && ticketNo) redirect(`/tickets/${ticketNo}`);

  const found = ticketNo ? await trackTicket(ticketNo) : null;
  return (
    <>
      {!found && <PageHeader eyebrow="Track" title="Track a ticket" />}
      <TrackBox basePath="/track" className="mb-6 max-w-md" />
      {found ? (
        <TrackedTicketView ticket={found.ticket} events={found.events} />
      ) : (
        <EmptyState icon={SearchX} title={`No ticket ${ticketNo ?? raw}`} description="Check the number and try again." />
      )}
    </>
  );
}
