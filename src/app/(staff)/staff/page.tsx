import type { Metadata } from "next";
import { CircleCheck, Copy, Inbox, LayoutDashboard, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ComingSoon } from "@/components/common/coming-soon";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Ticket Board" };

const STAT_CARDS = [
  { label: "Open", icon: Inbox },
  { label: "Urgent", icon: ShieldAlert },
  { label: "Possible duplicates", icon: Copy },
  { label: "Resolved today", icon: CircleCheck },
];

export default async function StaffBoardPage() {
  const profile = await requireProfile();
  const scope =
    profile.role === "warden"
      ? "All hostel tickets"
      : profile.role === "dean" || profile.role === "hod"
        ? "Read-only view"
        : profile.department ?? "Your department";

  return (
    <>
      <PageHeader eyebrow={scope} title="Ticket Board" description="Assign tickets, update status and review possible duplicates." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STAT_CARDS.map(({ label, icon: Icon }) => (
          <div key={label} className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">{label}</p>
              <Icon className="size-4 text-slate-400" />
            </div>
            <p className="mt-3 text-3xl font-extrabold text-slate-300">—</p>
          </div>
        ))}
      </div>
      <ComingSoon
        phase={3}
        icon={LayoutDashboard}
        what="Kanban (Submitted / Assigned / In Progress / Resolved) + list toggle, filters, and the ticket drawer with AI panel, duplicate comparison, assign, status change and history."
      />
    </>
  );
}
