import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { HistoryView } from "@/components/staff/history-view";
import { Button } from "@/components/ui/button";
import { ACADEMIC_CATEGORIES, HOSTEL_CATEGORIES } from "@/config/routing";
import { TICKET_STATUSES } from "@/config/statuses";
import { requireProfile } from "@/lib/auth";
import { normaliseTicketNo } from "@/lib/format";
import {
  getStaffTicketDetail,
  listAssignableStaff,
  listTicketHistory,
  parseHistoryFilters,
} from "@/lib/tickets/staff-queries";

export const metadata: Metadata = { title: "All Tickets" };

const field =
  "h-10 w-full rounded-full border border-slate-200 bg-white px-3.5 text-sm text-navy outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="eyebrow block px-1">{label}</span>
      {children}
    </label>
  );
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireProfile(["staff", "academic_office", "warden", "dean", "hod"]);
  const sp = await searchParams;
  const filters = parseHistoryFilters(sp);
  const selected = sp.t ? normaliseTicketNo(sp.t) : null;
  const viewer = { id: profile.id, role: profile.role, department: profile.department };

  const [tickets, staff, detail] = await Promise.all([
    listTicketHistory(viewer, filters),
    listAssignableStaff(),
    selected ? getStaffTicketDetail(selected, viewer) : Promise.resolve(null),
  ]);

  const categories =
    profile.role === "warden"
      ? HOSTEL_CATEGORIES
      : profile.role === "hod"
        ? ACADEMIC_CATEGORIES
        : [...new Set<string>([...HOSTEL_CATEGORIES, ...ACADEMIC_CATEGORIES])];
  const assignees =
    profile.role === "staff" || profile.role === "academic_office"
      ? staff.filter((s) => s.department === profile.department)
      : staff;

  return (
    <>
      <PageHeader
        eyebrow="History"
        title="All Tickets"
        description="Every ticket you can see — including Closed and Merged — with ratings."
      />

      {/* Plain GET form: filters live in the URL, so they can be shared and survive refresh. */}
      <form className="mb-5 grid animate-slide-up gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ticket no. or text">
          <input name="q" defaultValue={filters.q ?? ""} placeholder="CC-1004 or 'tap'" className={field} />
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={filters.status ?? ""} className={field}>
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={filters.category ?? ""} className={field}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Assignee">
          <select name="assignee" defaultValue={filters.assignee ?? ""} className={field}>
            <option value="">Anyone</option>
            {assignees.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}{profile.role === "staff" ? "" : ` · ${s.department}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Reported from">
          <input type="date" name="from" defaultValue={filters.from ?? ""} className={field} />
        </Field>
        <Field label="Reported to">
          <input type="date" name="to" defaultValue={filters.to ?? ""} className={field} />
        </Field>
        <Field label="Rating">
          <select name="rating" defaultValue={filters.rating ?? ""} className={field}>
            <option value="">Any</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{"★".repeat(n)} ({n})</option>
            ))}
            <option value="unrated">Closed, not rated</option>
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit" className="flex-1"><Search /> Apply</Button>
          <Button variant="ghost" asChild><Link href="/staff/history">Clear</Link></Button>
        </div>
      </form>

      <HistoryView tickets={tickets} staff={staff} viewer={viewer} selectedTicketNo={selected} detail={detail} />
    </>
  );
}
