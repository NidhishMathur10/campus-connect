import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, SearchX } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { normaliseTicketNo } from "@/lib/format";
import { getMyTicket, trackTicket } from "@/lib/tickets/queries";
import { TrackedTicketView, TicketDetail } from "./ticket-detail";
import { TrackBox } from "./track-box";

/** One ticket for its reporter (full view) or anyone else (basic tracking view). Students and faculty share it. */
export async function TicketPage({
  rawTicketNo,
  viewerId,
  basePath,
  backLabel,
}: {
  rawTicketNo: string;
  viewerId: string;
  basePath: string;
  backLabel: string;
}) {
  const ticketNo = normaliseTicketNo(rawTicketNo);
  if (!ticketNo) notFound();

  const back = (
    <Link href={basePath} className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-foreground">
      <ArrowLeft className="size-4" /> {backLabel}
    </Link>
  );

  // Own / followed ticket → full view. Anyone else's → basic tracking view.
  const full = await getMyTicket(ticketNo, viewerId);
  if (full) {
    return (
      <>
        {back}
        <TicketDetail ticket={full.ticket} events={full.events} viewerId={viewerId} mergedInto={full.mergedInto} basePath={basePath} />
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
        action={<TrackBox basePath={basePath} className="w-80 max-w-full" />}
      />
    </>
  );
}
