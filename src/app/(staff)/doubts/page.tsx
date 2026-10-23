import type { Metadata } from "next";
import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { DoubtList } from "@/components/doubts/doubt-bits";
import { requireProfile } from "@/lib/auth";
import { listInbox } from "@/lib/doubts/queries";
import { runSlaWatcher } from "@/lib/sla-watcher";

export const metadata: Metadata = { title: "Doubt inbox" };

/** Teacher inbox: doubts waiting for an answer first, longest waiting at the top. The HOD sees all subjects, read-only. */
export default async function DoubtInboxPage() {
  const profile = await requireProfile(["teacher", "hod"]);
  await runSlaWatcher();
  const items = await listInbox({ id: profile.id, role: profile.role, subjects: profile.subjects ?? [] });
  const waiting = items.filter((i) => i.status === "open");
  const rest = items.filter((i) => i.status !== "open");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Ask my teacher"
        title="Doubt inbox"
        description={
          profile.role === "teacher"
            ? profile.subjects?.length
              ? `Private doubts for ${profile.subjects.join(", ")}. Unanswered ones come first.`
              : "No subjects are assigned to you yet. Ask the warden or HOD to add them."
            : "Every private doubt, all subjects. You can read them; the subject teachers reply."
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={Inbox} title="No doubts yet" description="When a student asks you a private doubt it shows up here and in your notifications." />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-text">
              Waiting for an answer <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-bold text-warning-fg">{waiting.length}</span>
            </h2>
            {waiting.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-text-muted">All caught up.</p>
            ) : (
              <DoubtList items={waiting} basePath="/doubts" forTeacher />
            )}
          </section>
          {rest.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-extrabold text-text">Answered and closed</h2>
              <DoubtList items={rest} basePath="/doubts" forTeacher />
            </section>
          )}
        </>
      )}
    </div>
  );
}
