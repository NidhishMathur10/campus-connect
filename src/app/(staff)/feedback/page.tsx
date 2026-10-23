import type { Metadata } from "next";
import { Star } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { FeedbackStatsCard } from "@/components/feedback/feedback-bits";
import { FEEDBACK_MIN_RESPONSES, currentTerm } from "@/config/feedback";
import { requireProfile } from "@/lib/auth";
import { getFeedbackStats } from "@/lib/feedback/queries";

export const metadata: Metadata = { title: "My feedback" };

/** A teacher's own feedback: averages and AI themes once 5+ students responded. Never names, never verbatim comments. */
export default async function MyFeedbackPage() {
  const profile = await requireProfile(["teacher"]);
  const stats = await getFeedbackStats({ teacherId: profile.id, withComments: false });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        eyebrow={`Student feedback · ${currentTerm()}`}
        title="My feedback"
        description={`Anonymous ratings from students. To protect them, results show only when at least ${FEEDBACK_MIN_RESPONSES} students have responded for a subject, and comments appear only as an AI summary of themes.`}
      />
      {stats.length === 0 ? (
        <EmptyState icon={Star} title="No subjects assigned" description="Ask the warden or HOD to assign your subjects, then student feedback will show up here." />
      ) : (
        stats.map((s) => <FeedbackStatsCard key={`${s.teacherId}-${s.subject}`} stats={s} showComments={false} showTeacher={false} />)
      )}
    </div>
  );
}
