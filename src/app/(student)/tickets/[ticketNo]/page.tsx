import type { Metadata } from "next";
import { TicketPage } from "@/components/tickets/ticket-page";
import { requireProfile } from "@/lib/auth";
import { normaliseTicketNo } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ ticketNo: string }> }): Promise<Metadata> {
  const { ticketNo } = await params;
  return { title: normaliseTicketNo(ticketNo) ?? "Ticket" };
}

export default async function StudentTicketPage({ params }: { params: Promise<{ ticketNo: string }> }) {
  const profile = await requireProfile(["student"]);
  const { ticketNo } = await params;
  return <TicketPage rawTicketNo={ticketNo} viewerId={profile.id} basePath="/tickets" backLabel="My tickets" />;
}
