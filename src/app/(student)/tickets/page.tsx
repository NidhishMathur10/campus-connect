import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Ticket } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { TicketCard } from "@/components/tickets/ticket-card";
import { TrackBox } from "@/components/tickets/track-box";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { listMyTickets, type TicketFilter } from "@/lib/tickets/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Tickets" };

const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
];

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const profile = await requireProfile(["student"]);
  const { filter: raw } = await searchParams;
  const filter: TicketFilter = raw === "resolved" ? "resolved" : "active";
  const tickets = await listMyTickets(profile.id, filter);

  return (
    <>
      <PageHeader
        eyebrow="Track"
        title="My Tickets"
        description="Everything you've reported (and joined with “Me too”), with live progress."
        actions={
          <Button asChild>
            <Link href="/hostel"><Plus /> Report a problem</Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <nav className="flex w-fit gap-1 rounded-full border border-slate-200 bg-white p-1" aria-label="Filter tickets">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "active" ? "/tickets" : `/tickets?filter=${f.value}`}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                filter === f.value ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100",
              )}
              aria-current={filter === f.value ? "page" : undefined}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <TrackBox className="sm:w-96" />
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={filter === "active" ? "No open tickets" : "No resolved tickets yet"}
          description={
            filter === "active"
              ? "When you report a problem it shows up here with its live progress."
              : "Tickets move here once staff resolve them and you confirm the fix."
          }
          action={
            <Button asChild>
              <Link href="/hostel"><Plus /> Report a problem</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} />
          ))}
        </div>
      )}
    </>
  );
}
