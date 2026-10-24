import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobDetailView } from "@/components/jobs/job-detail";
import { ROLE_LABELS } from "@/config/roles";
import { requireProfile } from "@/lib/auth";
import { normaliseTicketNo } from "@/lib/format";
import { toJobTicket } from "@/lib/jobs/queries";
import { getStaffTicketDetail } from "@/lib/tickets/staff-queries";
import type { JobEvent } from "@/components/jobs/job-detail";

export const metadata: Metadata = { title: "Job details" };

/** Events the simple view shows: nothing internal, no overrides or duplicate checks. */
const HIDDEN_EVENT_TYPES = ["override", "duplicate_flagged", "duplicate_dismissed", "escalated"];

export default async function JobPage({ params }: { params: Promise<{ ticketNo: string }> }) {
  const profile = await requireProfile(["staff", "security_officer"]);
  const ticketNo = normaliseTicketNo((await params).ticketNo);
  if (!ticketNo) notFound();

  const viewer = { id: profile.id, role: profile.role, department: profile.department };
  const detail = await getStaffTicketDetail(ticketNo, viewer);
  if (!detail) notFound();
  const { ticket } = detail;
  const confidential = ticket.is_confidential;

  const events: JobEvent[] = confidential
    ? []
    : detail.events
        .filter((e) => !e.is_internal && !HIDDEN_EVENT_TYPES.includes(e.type))
        .map((e) => ({
          id: e.id,
          at: e.created_at,
          who: e.actor_name,
          toStatus: e.to_status,
          type: e.type,
          note: e.note,
        }));

  const afterPhoto = (ticket.ai_meta as { after_photo_url?: unknown } | null)?.after_photo_url;
  const reporter = confidential || detail.reporterHidden ? null : detail.reporter;

  return (
    <JobDetailView
      job={toJobTicket(ticket, detail.followerCount)}
      mine={ticket.assigned_to === profile.id}
      description={confidential ? null : (ticket.english_text || ticket.original_text)}
      original={!confidential && ticket.language !== "en" ? ticket.original_text : null}
      afterPhoto={typeof afterPhoto === "string" && !confidential ? afterPhoto : null}
      reporter={reporter ? { name: reporter.full_name, room: [reporter.hostel, reporter.wing, reporter.room].filter(Boolean).join(" · ") || null } : null}
      events={events}
      userId={profile.id}
      user={{ fullName: profile.full_name, roleLabel: ROLE_LABELS[profile.role], subtitle: profile.department ?? ROLE_LABELS[profile.role] }}
    />
  );
}
