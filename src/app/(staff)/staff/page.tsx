import type { Metadata } from "next";
import { StaffBoard } from "@/components/staff/board";
import { PageHeader } from "@/components/common/page-header";
import { requireProfile } from "@/lib/auth";
import { ModerationFlags } from "@/components/staff/moderation-flags";
import { normaliseTicketNo } from "@/lib/format";
import { listModerationFlags } from "@/lib/moderation";
import { getBoardData, getStaffTicketDetail } from "@/lib/tickets/staff-queries";

export const metadata: Metadata = { title: "Ticket Board" };

export default async function StaffBoardPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const profile = await requireProfile(["staff", "academic_office", "security_officer", "arc", "warden", "dean", "hod"]);
  const { t } = await searchParams;
  const selected = t ? normaliseTicketNo(t) : null;
  const viewer = { id: profile.id, role: profile.role, department: profile.department };

  const [data, detail, flags] = await Promise.all([
    getBoardData(viewer),
    selected ? getStaffTicketDetail(selected, viewer) : Promise.resolve(null),
    profile.role === "warden" ? listModerationFlags() : Promise.resolve([]),
  ]);

  const scope =
    profile.role === "warden"
      ? "All hostel tickets"
      : profile.role === "dean"
        ? "All tickets · read-only"
        : profile.role === "hod"
          ? "Academic tickets · read-only"
          : (profile.department ?? "Your department");

  return (
    <>
      <PageHeader eyebrow={scope} title="Ticket Board" description="Assign tickets, update status and review possible duplicates." />
      <ModerationFlags flags={flags} />
      <StaffBoard data={data} viewer={viewer} selectedTicketNo={selected} detail={detail} />
    </>
  );
}
