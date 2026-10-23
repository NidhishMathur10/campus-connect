import Link from "next/link";
import { Plus, Ticket } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { listMyTickets, type TicketFilter } from "@/lib/tickets/queries";
import { cn } from "@/lib/utils";
import { LiveRefresh } from "./live-refresh";
import { TicketCard } from "./ticket-card";
import { TrackBox } from "./track-box";

const FILTERS: { value: TicketFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

/**
 * "My Tickets" (students) / "My Reports" (faculty): the same cards and live timeline links,
 * only the wording and base path differ.
 */
export async function MyTicketsView({
  userId,
  rawFilter,
  basePath,
  reportHref,
  title,
  description,
  reportLabel,
}: {
  userId: string;
  rawFilter?: string;
  /** "/tickets" or "/reports" — also the base of every ticket link. */
  basePath: string;
  reportHref: string;
  title: string;
  description: string;
  reportLabel: string;
}) {
  // "resolved" kept so old links still work.
  const filter: TicketFilter = rawFilter === "completed" || rawFilter === "resolved" ? "completed" : "active";
  const tickets = await listMyTickets(userId, filter);

  return (
    <>
      <PageHeader
        eyebrow="Track"
        title={title}
        description={description}
        actions={
          <>
            <LiveRefresh className="self-center" />
            <Button asChild>
              <Link href={reportHref}><Plus /> {reportLabel}</Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <nav className="flex w-fit gap-1 rounded-full border border-border bg-card p-1" aria-label="Filter tickets">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "active" ? basePath : `${basePath}?filter=${f.value}`}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-semibold transition-colors",
                filter === f.value ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100",
              )}
              aria-current={filter === f.value ? "page" : undefined}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <TrackBox basePath={basePath} className="sm:w-96" />
      </div>

      {tickets.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title={filter === "active" ? `No open ${title.toLowerCase()}` : `No completed ${title.toLowerCase()} yet`}
          description={
            filter === "active"
              ? "When you report a problem it shows up here with its live progress."
              : "Tickets move here once you confirm the fix, or when staff merge a duplicate into an earlier report."
          }
          action={
            <Button asChild>
              <Link href={reportHref}><Plus /> {reportLabel}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tickets.map((t) => (
            <TicketCard key={t.id} ticket={t} basePath={basePath} />
          ))}
        </div>
      )}
    </>
  );
}
