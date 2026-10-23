import type { Metadata } from "next";
import Link from "next/link";
import { ArrowBigUp, BadgeCheck, MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { SubjectBadge } from "@/components/qa/qa-bits";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { listMyAnswers } from "@/lib/faculty/queries";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "My Answers" };

export default async function MyAnswersPage() {
  const profile = await requireProfile(["teacher"]);
  const answers = await listMyAnswers(profile.id);
  const best = answers.filter((a) => a.is_best).length;

  return (
    <>
      <PageHeader
        eyebrow="Open Q&A"
        title="My Answers"
        description={
          answers.length
            ? `${answers.length} answer${answers.length === 1 ? "" : "s"} · ${best} marked best`
            : "Questions you've answered will be listed here."
        }
        actions={
          <Button variant="outline" asChild>
            <Link href="/qa"><MessagesSquare /> Q&amp;A Board</Link>
          </Button>
        }
      />

      {answers.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="No answers yet"
          description="Open the Q&A Board to see which student questions are still waiting for a teacher."
          action={
            <Button asChild>
              <Link href="/qa">Go to Q&amp;A Board</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {answers.map((a) => (
            <li
              key={a.answer_id}
              className="group relative animate-slide-up space-y-2 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <SubjectBadge subject={a.subject} />
                {a.is_best && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    <BadgeCheck className="size-3.5" /> Best answer
                  </span>
                )}
              </div>
              <h3 className="font-bold text-navy group-hover:text-accent-blue">
                <Link href={`/qa/${a.question_id}`} className="after:absolute after:inset-0 after:rounded-3xl">
                  {a.question_title}
                </Link>
              </h3>
              <p className="line-clamp-3 text-sm text-slate-600">{a.excerpt}</p>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1" title="Upvotes on your answer">
                  <ArrowBigUp className="size-4" /> {a.answer_upvotes} on your answer
                </span>
                <span title="Upvotes on the question">{a.question_upvotes} on the question</span>
                <span>{timeAgo(a.created_at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
