import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, BellRing, CheckCircle2, Mail, MessageCircle, MinusCircle } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { requireProfile } from "@/lib/auth";
import { emailEnabled } from "@/lib/email/send";
import { whatsappConfigured } from "@/lib/email/whatsapp";
import { pushConfigured } from "@/lib/push/send";
import { formatDateTime } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Notification log" };

interface LogRow {
  id: string;
  to_email: string;
  original_to: string | null;
  template: string;
  ticket_id: string | null;
  channel: "email" | "whatsapp" | "push";
  status: "sent" | "failed" | "skipped";
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
  sla_reminder: "Deadline reminder",
  sla_reassigned: "Reassigned",
  help_request: "Needs help",
  help_reply: "Reply to staff",
  ticket_reopened: "Reopened",
  notice_urgent: "Urgent notice",
  notice_known_issue: "Known issue",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
] as const;

export default async function NotificationLogPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const profile = await requireProfile(["warden", "dean", "hod", "security_officer"]);
  const { status } = await searchParams;
  const failedOnly = status === "failed";

  const admin = createAdminClient();
  const { data, error } = await admin.from("email_log").select("*").order("created_at", { ascending: false }).limit(300);
  if (error) console.error("[email-log]", error.message);
  let rows = (data ?? []) as LogRow[];

  // Ticket numbers; the warden never sees anything about Safety & Security tickets.
  const ticketIds = [...new Set(rows.map((r) => r.ticket_id).filter((id): id is string => !!id))];
  const tickets = new Map<string, { ticket_no: string; module: string; is_confidential: boolean }>();
  if (ticketIds.length) {
    const { data: t } = await admin.from("tickets").select("id, ticket_no, module, is_confidential").in("id", ticketIds);
    for (const x of t ?? []) tickets.set(x.id, { ticket_no: x.ticket_no, module: x.module, is_confidential: !!x.is_confidential });
  }
  if (profile.role === "warden") {
    rows = rows.filter(
      (r) => r.template !== "confidential_update" && !(r.ticket_id && tickets.get(r.ticket_id)?.module === "security"),
    );
  }

  // HOD: academic tickets only. Security officer: Safety & Security tickets (never confidential ones) and Lost & Found only.
  if (profile.role === "hod") {
    rows = rows.filter((r) => {
      const t = r.ticket_id ? tickets.get(r.ticket_id) : null;
      return !!t && t.module === "academic" && !t.is_confidential && r.template !== "confidential_update";
    });
  } else if (profile.role === "security_officer") {
    rows = rows.filter((r) => {
      if (r.template.startsWith("lf_")) return true;
      const t = r.ticket_id ? tickets.get(r.ticket_id) : null;
      return !!t && t.module === "security" && !t.is_confidential && r.template !== "confidential_update";
    });
  }

  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const skipped = rows.length - sent - failed;
  const shown = failedOnly ? rows.filter((r) => r.status === "failed") : rows;

  return (
    <>
      <PageHeader
        eyebrow="Notifications"
        title="Notification log"
        description="Every email, WhatsApp message and phone push CampusConnect tried to send, newest first (last 300 attempts)."
      />

      {!emailEnabled() && (
        <p className="mb-6 flex items-start gap-2 rounded-3xl border border-warning-fg/30 bg-warning-bg p-4 text-sm font-semibold text-warning-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Email is switched off: SMTP_HOST is not set, so nothing is being sent.
        </p>
      )}
      {!whatsappConfigured() && (
        <p className="mb-6 flex items-start gap-2 rounded-3xl border border-warning-fg/30 bg-warning-bg p-4 text-sm font-semibold text-warning-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          WhatsApp is switched off: the Twilio variables are not all set, so messages are logged as skipped.
        </p>
      )}

      {!pushConfigured() && (
        <p className="mb-6 flex items-start gap-2 rounded-3xl border border-warning-fg/30 bg-warning-bg p-4 text-sm font-semibold text-warning-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Phone push is switched off: the VAPID keys are not set, so no push notifications are sent.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success-fg/30 bg-success-bg px-3 py-1 text-sm font-bold text-success-fg">
          <CheckCircle2 className="size-4" /> {sent} sent
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold",
            failed ? "border-danger-fg/30 bg-danger-bg text-danger-fg" : "border-border bg-surface text-text-muted",
          )}
        >
          <AlertTriangle className="size-4" /> {failed} failed
        </span>
        {skipped > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-sm font-bold text-text-muted">
            <MinusCircle className="size-4" /> {skipped} skipped
          </span>
        )}
        <nav className="ml-auto flex gap-1 rounded-full border border-border bg-surface p-1" aria-label="Filter notifications">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value === "all" ? "/email-log" : `/email-log?status=${f.value}`}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                (f.value === "failed") === failedOnly ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2",
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
          title={failedOnly ? "No failed notifications" : "No notifications yet"}
          description="Emails and WhatsApp messages show up here as soon as tickets are created, assigned or resolved."
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl border border-border bg-surface shadow-sm">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs font-bold tracking-wider text-text-muted uppercase">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Ticket</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => (
                <tr key={r.id} className={r.status === "failed" ? "bg-danger-bg/40" : undefined}>
                  <td className="px-4 py-3 whitespace-nowrap text-text-muted">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-text">{r.to_email}</p>
                    {r.original_to && <p className="text-xs text-text-muted">Demo — meant for {r.original_to}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-text-muted">
                      {r.channel === "whatsapp" ? (
                        <MessageCircle className="size-3.5" />
                      ) : r.channel === "push" ? (
                        <BellRing className="size-3.5" />
                      ) : (
                        <Mail className="size-3.5" />
                      )}
                      {r.channel === "whatsapp" ? "WhatsApp" : r.channel === "push" ? "Push" : "Email"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-text">{TEMPLATE_LABELS[r.template] ?? r.template}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold text-accent-text">
                    {r.ticket_id ? (tickets.get(r.ticket_id)?.ticket_no ?? "—") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "sent" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-bg px-2.5 py-0.5 text-xs font-bold text-success-fg">
                        <CheckCircle2 className="size-3.5" /> Sent
                      </span>
                    ) : r.status === "skipped" ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-bg px-2.5 py-0.5 text-xs font-bold text-neutral-fg">
                          <MinusCircle className="size-3.5" /> Skipped
                        </span>
                        {r.error && <p className="max-w-xs text-xs break-words text-text-muted">{r.error}</p>}
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2.5 py-0.5 text-xs font-bold text-danger-fg">
                          <AlertTriangle className="size-3.5" /> Failed
                        </span>
                        {r.error && <p className="max-w-xs text-xs break-words text-danger-fg">{r.error}</p>}
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
