import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, ClipboardPlus, Inbox, MessagesSquare, Ticket } from "lucide-react";
import { CategoryBadge, StatusBadge } from "@/components/common/badges";
import { PageHeader } from "@/components/common/page-header";
import { SubjectBadge } from "@/components/qa/qa-bits";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth";
import { listMyAnswers } from "@/lib/faculty/queries";
import { timeAgo } from "@/lib/format";
import { getTeacherQueue } from "@/lib/qa/queries";
import { listMyTickets } from "@/lib/tickets/queries";

export const metadata: Metadata = { title: "Home" };

function Panel({
  title,
  icon: Icon,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  icon: typeof Inbox;
  href: string;
  hrefLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-foreground">
          <Icon className="size-5" /> {title}
        </h2>
        <Link href={href} className="inline-flex items-center gap-1 text-xs font-bold text-accent-text hover:underline">
          {hrefLabel} <ArrowRight className="size-3.5" />
        </Link>
      </div>
      {children}
    </section>
  );
}

const empty = (text: string) => (
  <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-slate-500">{text}</p>
);

export default async function FacultyHomePage() {
  const profile = await requireProfile(["teacher"]);
  const [queue, reports, answers] = await Promise.all([
    getTeacherQueue(profile),
    listMyTickets(profile.id, "active"),
    listMyAnswers(profile.id, 5),
  ]);
  const unanswered = queue.reduce((n, g) => n + g.questions.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Faculty"
        title={`Hello, ${profile.full_name}`}
        description="Student questions waiting for you, the issues you've reported, and your recent answers."
        actions={
          <Button asChild>
            <Link href="/report"><ClipboardPlus /> Report an issue</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Unanswered questions" icon={Inbox} href="/qa" hrefLabel="Q&A Board">
          <p className="text-4xl font-extrabold tracking-tight text-foreground">{unanswered}</p>
          {queue.length === 0 ? (
            empty("All caught up — every question has a teacher answer.")
          ) : (
            <ul className="space-y-1.5">
              {queue.map((g) => (
                <li key={g.subject} className="flex items-center justify-between gap-2">
                  <SubjectBadge subject={g.subject} />
                  <span className="text-sm font-extrabold text-foreground">{g.questions.length}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="My open reports" icon={Ticket} href="/reports" hrefLabel="My Reports">
          {reports.length === 0 ? (
            empty("No open reports. Use “Report an issue” if something needs fixing.")
          ) : (
            <ul className="space-y-1">
              {reports.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link href={`/reports/${t.ticket_no}`} className="block space-y-1 rounded-2xl px-3 py-2 hover:bg-sky-tint">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-accent-text">{t.ticket_no}</span>
                      <StatusBadge status={t.status} />
                    </span>
                    <span className="line-clamp-1 block text-sm font-bold text-foreground">{t.title}</span>
                    <CategoryBadge category={t.category} className="px-2 text-[11px]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="My recent answers" icon={MessagesSquare} href="/answers" hrefLabel="All answers">
          {answers.length === 0 ? (
            empty("You haven't answered a question yet.")
          ) : (
            <ul className="space-y-1">
              {answers.map((a) => (
                <li key={a.answer_id}>
                  <Link href={`/qa/${a.question_id}`} className="block space-y-0.5 rounded-2xl px-3 py-2 hover:bg-sky-tint">
                    <span className="line-clamp-2 block text-sm font-bold text-foreground">{a.question_title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      {a.is_best && <BadgeCheck className="size-3.5 text-emerald-700" />}
                      {a.is_best ? "Best answer · " : ""}
                      {a.answer_upvotes} upvote{a.answer_upvotes === 1 ? "" : "s"} · {timeAgo(a.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
