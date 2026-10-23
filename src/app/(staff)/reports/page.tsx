import type { Metadata } from "next";
import { MyTicketsView } from "@/components/tickets/my-tickets-view";
import { FACULTY_ROLES } from "@/config/faculty";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "My Reports" };

export default async function MyReportsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const profile = await requireProfile(FACULTY_ROLES);
  const { filter } = await searchParams;

  return (
    <MyTicketsView
      userId={profile.id}
      rawFilter={filter}
      basePath="/reports"
      reportHref="/report"
      title="My Reports"
      description="Every issue you've reported (and joined with “Me too”), with live progress. Confirm the fix or reopen it once staff mark it resolved."
      reportLabel="Report an issue"
    />
  );
}
