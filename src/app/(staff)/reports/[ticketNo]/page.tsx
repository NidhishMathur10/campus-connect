import type { Metadata } from "next";
import { TicketPage } from "@/components/tickets/ticket-page";
import { FACULTY_ROLES } from "@/config/faculty";
import { requireProfile } from "@/lib/auth";
import { normaliseTicketNo } from "@/lib/format";

export async function generateMetadata({ params }: { params: Promise<{ ticketNo: string }> }): Promise<Metadata> {
  const { ticketNo } = await params;
  return { title: normaliseTicketNo(ticketNo) ?? "Report" };
}

export default async function FacultyReportDetailPage({ params }: { params: Promise<{ ticketNo: string }> }) {
  const profile = await requireProfile(FACULTY_ROLES);
  const { ticketNo } = await params;
  return <TicketPage rawTicketNo={ticketNo} viewerId={profile.id} basePath="/reports" backLabel="My reports" />;
}
