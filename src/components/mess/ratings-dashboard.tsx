import { Sparkles, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { DAY_NAMES, MEAL_LABELS, MEALS } from "@/config/mess";
import type { RatingsDashboard } from "@/lib/mess/types";
import { cn } from "@/lib/utils";

const fmt = (n: number | null) => (n == null ? "–" : n.toFixed(1));

/** Colour a 1-5 average with theme tokens: low = danger, middle = warning, high = success. */
const tone = (n: number | null) =>
  n == null ? "bg-surface-2 text-text-muted" : n < 3 ? "bg-danger-bg text-danger-fg" : n < 4 ? "bg-warning-bg text-warning-fg" : "bg-success-bg text-success-fg";

export function RatingsDashboardView({ data }: { data: RatingsDashboard }) {
  if (data.total === 0) {
    return <EmptyState icon={Star} title="No ratings yet" description="Students can rate a meal once it has started. Ratings from the last 30 days show up here." />;
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
          <p className="eyebrow">Overall · 30 days</p>
          <p className="mt-1 flex items-baseline gap-1 text-3xl font-extrabold text-text">{fmt(data.avg)}<Star className="size-5 fill-star text-star" /></p>
          <p className="text-xs font-semibold text-text-muted">{data.total} ratings</p>
        </div>
        {data.byMeal.map((m) => (
          <div key={m.meal} className="rounded-3xl border border-border bg-surface p-4 shadow-sm">
            <p className="eyebrow">{MEAL_LABELS[m.meal]}</p>
            <p className="mt-1 text-3xl font-extrabold text-text">{fmt(m.avg)}</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${((m.avg ?? 0) / 5) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs font-semibold text-text-muted">{m.count} ratings</p>
          </div>
        ))}
      </div>

      <section className="overflow-x-auto rounded-3xl border border-border bg-surface p-5 shadow-sm" aria-label="Average rating by day and meal">
        <h3 className="mb-3 font-extrabold text-text">By day and meal</h3>
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="eyebrow pb-2">Day</th>
              {MEALS.map((m) => <th key={m} className="eyebrow pb-2 text-center">{MEAL_LABELS[m]}</th>)}
              <th className="eyebrow pb-2 text-center">All</th>
            </tr>
          </thead>
          <tbody>
            {data.byDay.map((d) => (
              <tr key={d.day}>
                <th scope="row" className="py-1 pr-3 text-left font-bold text-text">{DAY_NAMES[d.day]}</th>
                {MEALS.map((m) => (
                  <td key={m} className="p-1 text-center"><span className={cn("inline-block min-w-12 rounded-full px-2.5 py-1 font-bold", tone(d.meals[m]))}>{fmt(d.meals[m])}</span></td>
                ))}
                <td className="p-1 text-center"><span className={cn("inline-block min-w-12 rounded-full px-2.5 py-1 font-extrabold", tone(d.avg))}>{fmt(d.avg)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="font-extrabold text-text">Lowest-rated dishes</h3>
          <p className="mb-3 text-xs text-text-muted">A dish is scored by the meals it was served in (at least 2 ratings).</p>
          {data.lowestDishes.length === 0 ? (
            <p className="text-sm text-text-muted">Not enough ratings yet.</p>
          ) : (
            <ol className="space-y-2">
              {data.lowestDishes.map((d, i) => (
                <li key={d.name} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="font-bold text-text">{i + 1}. {d.name}</span>
                  <span className="flex items-center gap-2 text-text-muted"><span className={cn("rounded-full px-2 py-0.5 font-bold", tone(d.avg))}>{fmt(d.avg)}</span>{d.count} ratings</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="rounded-3xl border border-border bg-surface p-5 shadow-sm">
          <h3 className="flex items-center gap-2 font-extrabold text-text"><Sparkles className="size-4 text-accent-text" /> What students say</h3>
          {data.summary ? (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-text">{data.summary.overall}</p>
              {data.summary.praised.length > 0 && (
                <div>
                  <p className="eyebrow mb-1 flex items-center gap-1.5"><ThumbsUp className="size-3.5" /> Liked</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-text">{data.summary.praised.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              {data.summary.complaints.length > 0 && (
                <div>
                  <p className="eyebrow mb-1 flex items-center gap-1.5"><ThumbsDown className="size-3.5" /> Complaints</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-text">{data.summary.complaints.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              {data.summary.suggestion && <p className="rounded-2xl bg-surface-accent p-3 font-semibold text-text">Suggestion: {data.summary.suggestion}</p>}
            </div>
          ) : (
            <p className="mt-3 text-sm text-text-muted">
              {data.commentCount < 3 ? `A summary appears once there are 3 comments (${data.commentCount} so far).` : "The AI summary isn't available right now. It will be tried again on the next visit."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
