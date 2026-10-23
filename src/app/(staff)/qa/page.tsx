import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Hourglass, Inbox } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { SubjectBadge } from "@/components/qa/qa-bits";
import { QaList, type QaSearch } from "@/components/qa/qa-list";
import { requireProfile } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { countPendingReview, getTeacherQueue } from "@/lib/qa/queries";

export const metadata: Metadata = { title: "Q&A Board" };

export default async function TeacherQaPage({ searchParams }: { searchParams: Promise<QaSearch> }) {
  const profile = await requireProfile(["teacher", "academic_office", "hod", "dean"]);
  const sp = await searchParams;
  const isTeacher = profile.role === "teacher";
  const [queue, pending] = await Promise.all([getTeacherQueue(profile), isTeacher ? countPendingReview() : Promise.resolve(0)]);
  const openCount = queue.reduce((n, g) => n + g.questions.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Open Q&A"
        title="Q&A Board"
        description={
          isTeacher
            ? "Unanswered student questions, oldest first. You can see each author's roll number."
            : "Read-only view of the student Q&A board, with authors' roll numbers."
        }
      />

      <section className="mb-8 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-navy">
            <Inbox className="size-5" /> Unanswered questions
            <span className="rounded-full bg-navy px-2.5 py-0.5 text-sm text-white">{openCount}</span>
          </h2>
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">
              <Hourglass className="size-3.5" /> {pending} post{pending === 1 ? "" : "s"} pending review
            </span>
          )}
        </div>
        {queue.length === 0 ? (
          <p className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-6 text-center text-sm text-slate-500">
            All caught up — every question has a teacher answer. 🎉
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {queue.map((g) => (
              <div key={g.subject} className="animate-slide-up rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <SubjectBadge subject={g.subject} />
                  <span className="text-sm font-extrabold text-navy">{g.questions.length}</span>
                </div>
                <ul className="space-y-1">
                  {g.questions.map((q) => (
                    <li key={q.id}>
                      <Link href={`/qa/${q.id}`} className="block rounded-2xl px-3 py-2 hover:bg-sky-tint">
                        <span className="line-clamp-2 text-sm font-bold text-navy">{q.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                          <Clock className="size-3" /> {timeAgo(q.created_at)} · {q.author.name}
                          {q.author.roll_no && <span className="font-mono">({q.author.roll_no})</span>}
                          {q.answer_count > 0 && <span>· {q.answer_count} student answer{q.answer_count === 1 ? "" : "s"}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold text-navy">All questions</h2>
        <QaList viewer={profile} search={sp} basePath="/qa" filters={["all", "unanswered", "top"]} />
      </section>
    </>
  );
}
