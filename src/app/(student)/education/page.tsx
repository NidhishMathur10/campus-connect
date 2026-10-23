import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, MessagesSquare, Plus, Ticket } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { QaList, type QaSearch } from "@/components/qa/qa-list";
import { ReportFlow } from "@/components/report/report-flow";
import { Button } from "@/components/ui/button";
import { ACADEMIC_BUILDINGS } from "@/config/locations";
import { requireProfile } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Education" };

const TABS = [
  { value: "issues", label: "Academic Issues", icon: ClipboardList },
  { value: "qa", label: "Open Q&A", icon: MessagesSquare },
] as const;

export default async function EducationPage({ searchParams }: { searchParams: Promise<QaSearch & { tab?: string }> }) {
  const profile = await requireProfile(["student"]);
  const sp = await searchParams;
  const tab = sp.tab === "qa" ? "qa" : "issues";

  return (
    <div className={cn("mx-auto", tab === "issues" ? "max-w-3xl" : "max-w-4xl")}>
      <PageHeader
        eyebrow="Education"
        title={tab === "issues" ? "Report an academic issue" : "Open Q&A"}
        description={
          tab === "issues"
            ? "Projector, smart board, benches, lab computers, library, or a timetable / attendance / marks problem — describe it in your own words."
            : "Ask study doubts, help classmates, and get answers from teachers."
        }
        actions={
          tab === "issues" ? (
            <Button variant="outline" asChild>
              <Link href="/tickets"><Ticket /> My tickets</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/education/qa/new"><Plus /> Ask a question</Link>
            </Button>
          )
        }
      />

      <nav className="mb-6 flex w-full gap-1 rounded-full border border-border bg-card p-1 shadow-sm sm:w-fit">
        {TABS.map(({ value, label, icon: Icon }) => (
          <Link
            key={value}
            href={value === "issues" ? "/education" : "/education?tab=qa"}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-bold whitespace-nowrap transition-colors sm:flex-none",
              tab === value ? "bg-primary text-primary-foreground" : "text-slate-600 hover:bg-slate-100",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
      </nav>

      {tab === "issues" ? (
        <ReportFlow
          module="academic"
          userId={profile.id}
          buildings={ACADEMIC_BUILDINGS}
          textPlaceholder="Describe the problem — e.g. “Projector in B-204 shows no signal”, “Python missing on lab PCs”, or “My Basic Electrical attendance shows 40% but I attended all classes”"
        />
      ) : (
        <QaList viewer={profile} search={sp} basePath="/education/qa" />
      )}
    </div>
  );
}
