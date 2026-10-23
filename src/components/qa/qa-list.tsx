import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { QA_FILTERS, type QaFilter } from "@/config/qa";
import { listQuestions, type QaViewer } from "@/lib/qa/queries";
import { QaFilters } from "./qa-filters";
import { QuestionCard } from "./question-card";

export interface QaSearch {
  subject?: string;
  filter?: string;
  q?: string;
}

/** Server-rendered question list with URL-driven filters (shared by students and teachers). */
export async function QaList({
  viewer,
  search,
  basePath,
  filters = [...QA_FILTERS],
}: {
  viewer: QaViewer;
  search: QaSearch;
  basePath: string;
  filters?: QaFilter[];
}) {
  const filter = filters.includes(search.filter as QaFilter) ? (search.filter as QaFilter) : "all";
  const questions = await listQuestions(viewer, { subject: search.subject, filter, q: search.q });

  return (
    <div className="space-y-4">
      <Suspense>
        <QaFilters filters={filters} />
      </Suspense>
      {questions.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={filter === "mine" ? "You haven't asked anything yet" : "No questions here"}
          description={search.q || search.subject ? "Try another subject or search." : "Be the first to ask — doubts help everyone."}
        />
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <QuestionCard key={q.id} question={q} href={`${basePath}/${q.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
