import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { requireProfile } from "@/lib/auth";
import { listRevealLog } from "@/lib/concerns/queries";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

/** Every time a reporter's identity was opened on a concern: who, when, why. */
export default async function AuditPage() {
  await requireProfile(["dean"]);
  const rows = await listRevealLog();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader eyebrow="Confidential" title="Audit log" description="Each time the identity of a student who reported a concern about a teacher was opened. Ratings can never be revealed." />
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No identity has been revealed" description="Entries appear here the moment the Dean opens a reporter's identity." />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-extrabold text-text">{r.ticket_no}</span>
                <span className="text-text-muted">revealed by</span>
                <span className="font-bold text-text">{r.revealer_name}</span>
                <span className="ml-auto text-xs text-text-muted">{formatDateTime(r.created_at)}</span>
              </div>
              <p className="eyebrow mt-3">Reason</p>
              <p className="mt-1 text-sm whitespace-pre-line text-text">{r.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
