import type { Metadata } from "next";
import { Star } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { FeedbackStatsCard } from "@/components/feedback/feedback-bits";
import { FEEDBACK_MIN_RESPONSES, currentTerm } from "@/config/feedback";
import { requireProfile } from "@/lib/auth";
import { getFeedbackStats } from "@/lib/feedback/queries";

export const metadata: Metadata = { title: "Teacher feedback" };

/** HOD (Dean read-only): per teacher and subject averages, counts, comments as "Anonymous student" and AI themes. */
export default async function TeacherFeedbackPage() {
  await requireProfile(["hod", "dean"]);
  const stats = await getFeedbackStats({ withComments: true });
  const teachers = [...new Set(stats.map((s) => s.teacherName))];
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        eyebrow={`Anonymous student feedback · ${currentTerm()}`}
        title="Teacher feedback"
        description={`No name, roll number or room is ever shown with a rating. Numbers, comments and themes appear once ${FEEDBACK_MIN_RESPONSES} students have responded for a subject.`}
      />
      {stats.length === 0 ? (
        <EmptyState icon={Star} title="No feedback yet" description="Student ratings show up here as they come in." />
      ) : (
        teachers.map((name) => (
          <section key={name} className="space-y-4">
            <h2 className="text-2xl font-extrabold text-text">{name}</h2>
            {stats.filter((s) => s.teacherName === name).map((s) => (
              <FeedbackStatsCard key={`${s.teacherId}-${s.subject}`} stats={s} showComments showTeacher={false} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
