import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Mail } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { requireProfile } from "@/lib/auth";
import { emailEnabled } from "@/lib/email/send";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Email log" };

interface LogRow {
  id: string;
  to_email: string;
  original_to: string | null;
  template: string;
  ticket_id: string | null;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  ticket_created: "Ticket created",
  ticket_assigned: "Assigned",
  ticket_in_progress: "In progress",
  ticket_resolved: "Resolved",
  ticket_merged: "Merged",
  staff_assigned: "Assigned to staff",
  escalation: "Escalation",
  teacher_answered: "Teacher answered",
  confidential_update: "Confidential update",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
] as const;

export default async function EmailLogPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await requireProfile(["warden", "dean"]);
  const { status } = await searchParams;
  const failedOnly = status === "failed";

  const admin = createAdminClient();
  const { data, error } = await admin.from("email_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) console.error("[email-log]", error.message);
  let rows = (data ?? []) as LogRow[];

  // Ticket numbers; the warden never sees anything about Safety & Security tickets.
  const ticketIds = [...new Set(rows.map((r) => r.ticket_id).filter((id): id is string => !!id))];
  const tickets = new Map<string, { ticket_no: string; module: string }>();
  if (ticketIds.length) {
    const { data: t } = await admin.from("tickets").select("id, ticket_no, module").in("id", ticketIds);
    for (const x of t ?? []) tickets.set(x.id, { ticket_no: x.ticket_no, module: x.module });
  }
  if (profile.role === "warden") {
    rows = rows.filter(
      (r) => r.template !== "confidential_update" && !(r.ticket_id && tickets.get(r.ticket_id)?.module === "security"),
    );
  }

  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.length - sent;
  const shown = failedOnly ? rows.filter((r) => r.status === "failed") : rows;

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title="Email log"
        description="Every email CampusConnect tried to send, newest first (last 300 attempts)."
      />

      {!emailEnabled() && (
        <p className="mb-6 flex items-start gap-2 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Email is switched off: SMTP_HOST is not set, so nothing is being sent.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800">
          <CheckCircle2 className="size-4" /> {sent} sent
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold",
            failed ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-card text-slate-500",
          )}
        >
          <AlertTriangle className="size-4" /> {failed} failed
        </span>
        <nav className="ml-auto flex gap-1 rounded-full border border-border bg-card p-1" aria-label="Filter emails">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "all" ? "/email-log" : `/email-log?status=${f.value}`}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                (f.value === "failed") === failedOnly ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={Mail}
          title={failedOnly ? "No failed emails" : "No emails yet"}
          description="Emails show up here as soon as tickets are created, assigned or resolved."
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-slate-50 text-xs font-bold tracking-wider text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => (
                <tr key={r.id} className={r.status === "failed" ? "bg-red-50/40" : undefined}>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{r.to_email}</p>
                    {r.original_to && <p className="text-xs text-slate-500">Demo — meant for {r.original_to}</p>}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{TEMPLATE_LABELS[r.template] ?? r.template}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-accent-text">
                    {r.ticket_id ? (tickets.get(r.ticket_id)?.ticket_no ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "sent" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="size-3.5" /> Sent
                      </span>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                          <AlertTriangle className="size-3.5" /> Failed
                        </span>
                        {r.error && <p className="max-w-xs text-xs break-words text-red-700">{r.error}</p>}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
