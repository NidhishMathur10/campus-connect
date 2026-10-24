import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircleQuestion, Plus, ShieldAlert, Star, Ticket } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { RateTeachers } from "@/components/feedback/rate-teachers";
import { DoubtList } from "@/components/doubts/doubt-bits";
import { ModuleTabs } from "@/components/common/module-tabs";
import { PageHeader } from "@/components/common/page-header";
import { educationTabs } from "@/components/notices/module-tab-defs";
import { UrgentNotices } from "@/components/notices/urgent-notices";
import { QaList, type QaSearch } from "@/components/qa/qa-list";
import { ReportFlow } from "@/components/report/report-flow";
import { Button } from "@/components/ui/button";
import { ACADEMIC_BUILDINGS } from "@/config/locations";
import { currentTerm } from "@/config/feedback";
import { requireProfile } from "@/lib/auth";
import { listMyDoubts } from "@/lib/doubts/queries";
import { unreadNoticeCount } from "@/lib/notices/queries";
import { listRateableTeachers } from "@/lib/feedback/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Education" };

export default async function EducationPage({ searchParams }: { searchParams: Promise<QaSearch & { tab?: string }> }) {
  const profile = await requireProfile(["student"]);
  const sp = await searchParams;
  const tab = sp.tab === "qa" ? "qa" : sp.tab === "ask" ? "ask" : sp.tab === "feedback" ? "feedback" : "issues";
  const unread = await unreadNoticeCount(profile, "academic");
  const doubts = tab === "ask" ? await listMyDoubts(profile.id) : [];
  const rateable = tab === "feedback" ? await listRateableTeachers(profile.id) : [];

  return (
    <div className={cn("mx-auto", tab === "issues" ? "max-w-3xl" : "max-w-4xl")}>
      <PageHeader
        eyebrow="Education"
        title={tab === "issues" ? "Report an academic issue" : tab === "qa" ? "Open Q&A" : tab === "feedback" ? "Rate my teachers" : "Ask my teacher"}
        description={
          tab === "issues"
            ? "Projector, smart board, benches, lab computers, library, or a timetable / attendance / marks problem — describe it in your own words."
            : tab === "qa"
              ? "Ask study doubts, help classmates, and get answers from teachers."
              : tab === "feedback"
                ? "Tell us how teaching is going. Your feedback is anonymous."
                : "Ask your subject teacher a doubt privately. Only you, the teacher and the HOD can see it."
        }
        actions={
          tab === "issues" ? (
            <Button variant="outline" asChild>
              <Link href="/tickets"><Ticket /> My tickets</Link>
            </Button>
          ) : tab === "qa" ? (
            <Button asChild>
              <Link href="/education/qa/new"><Plus /> Ask a question</Link>
            </Button>
          ) : tab === "feedback" ? (
            <Button variant="outline" asChild>
              <Link href="/education/concern"><ShieldAlert /> Report a concern</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href="/education/doubts/new"><Plus /> New doubt</Link>
            </Button>
          )
        }
      />

      <ModuleTabs tabs={educationTabs(unread)} active={tab} />
      <UrgentNotices profile={profile} page="academic" />

      {tab === "issues" ? (
        <ReportFlow
          module="academic"
          userId={profile.id}
          buildings={ACADEMIC_BUILDINGS}
          textPlaceholder="Describe the problem — e.g. “Projector in B-204 shows no signal”, “Python missing on lab PCs”, or “My Basic Electrical attendance shows 40% but I attended all classes”"
        />
      ) : tab === "qa" ? (
        <QaList viewer={profile} search={sp} basePath="/education/qa" />
      ) : tab === "feedback" ? (
        rateable.length === 0 ? (
          <EmptyState icon={Star} title="No teachers to rate yet" description="Teachers appear here once the warden or HOD has assigned them their subjects." />
        ) : (
          <div className="space-y-6">
            <RateTeachers items={rateable} term={currentTerm()} />
            <div className="flex flex-col items-start gap-3 rounded-3xl border border-border bg-surface-accent p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-extrabold text-text">Something more serious?</p>
                <p className="text-sm text-text-muted">Report a formal concern about a teacher: unfair marking, irregular classes, disrespect or discrimination. It is anonymous.</p>
              </div>
              <Button asChild><Link href="/education/concern"><ShieldAlert /> Report a concern</Link></Button>
            </div>
          </div>
        )
      ) : doubts.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestion}
          title="No private doubts yet"
          description="Stuck on something you would rather not ask in public? Send it to your subject teacher."
          action={<Button asChild><Link href="/education/doubts/new"><Plus /> Ask my teacher</Link></Button>}
        />
      ) : (
        <DoubtList items={doubts} basePath="/education/doubts" />
      )}
    </div>
  );
}
