import type { Metadata } from "next";
import { MyTicketsView } from "@/components/tickets/my-tickets-view";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "My Tickets" };

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const profile = await requireProfile(["student"]);
  const { filter } = await searchParams;

  return (
    <MyTicketsView
      userId={profile.id}
      rawFilter={filter}
      basePath="/tickets"
      reportHref="/hostel"
      title="My Tickets"
      description="Everything you've reported (and joined with “Me too”), with live progress."
      reportLabel="Report a problem"
    />
  );
}
