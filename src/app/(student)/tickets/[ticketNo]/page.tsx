import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { TicketDetail, TrackedTicketView } from "@/components/tickets/ticket-detail";
import { TrackBox } from "@/components/tickets/track-box";
import { requireProfile } from "@/lib/auth";
import { normaliseTicketNo } from "@/lib/format";
import { getVisibleTicket, trackTicket } from "@/lib/tickets/queries";

export async function generateMetadata({ params }: { params: Promise<{ ticketNo: string }> }): Promise<Metadata> {
  const { ticketNo } = await params;
  return { title: normaliseTicketNo(ticketNo) ?? "Ticket" };
}

export default async function TicketPage({ params }: { params: Promise<{ ticketNo: string }> }) {
  const profile = await requireProfile(["student"]);
  const { ticketNo: raw } = await params;
  const ticketNo = normaliseTicketNo(raw);
  if (!ticketNo) notFound();

  const back = (
    <Link href="/tickets" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-navy">
      <ArrowLeft className="size-4" /> My tickets
    </Link>
  );

  // Own / followed ticket → full view. Anyone else's → basic tracking view.
  const full = await getVisibleTicket(ticketNo);
  if (full) {
    return (
      <>
        {back}
        <TicketDetail ticket={full.ticket} events={full.events} viewerId={profile.id} mergedInto={full.mergedInto} />
      </>
    );
  }

  const basic = await trackTicket(ticketNo);
  if (basic) {
    return (
      <>
        {back}
        <TrackedTicketView ticket={basic.ticket} events={basic.events} />
      </>
    );
  }

  return (
    <>
      {back}
      <EmptyState
        icon={SearchX}
        title={`No ticket ${ticketNo}`}
        description="Check the number and try again."
        action={<TrackBox className="w-80 max-w-full" />}
      />
    </>
  );
}
