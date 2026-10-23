import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QA_ANSWER_ROLES, QA_MODERATOR_ROLES } from "@/config/qa";
import { getQuestionDetail } from "@/lib/qa/queries";
import type { Profile } from "@/lib/types";
import { QuestionView } from "./question-view";

/** Question detail page body, shared by the student (/education/qa) and teacher (/qa) routes. */
export async function QuestionPage({ id, profile, backHref }: { id: string; profile: Profile; backHref: string }) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getQuestionDetail(id, profile);
  if (!detail) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={backHref}><ArrowLeft /> All questions</Link>
      </Button>
      <QuestionView
        detail={detail}
        viewer={{
          id: profile.id,
          isTeacher: QA_MODERATOR_ROLES.includes(profile.role),
          canPost: QA_ANSWER_ROLES.includes(profile.role),
        }}
      />
    </div>
  );
}
