"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DOUBT_SUBJECTS } from "@/config/subjects";
import { saveTeacherSubjects } from "@/lib/doubts/actions";
import type { TeacherRef } from "@/lib/doubts/queries";
import { cn } from "@/lib/utils";

function TeacherRow({ teacher, readOnly }: { teacher: TeacherRef; readOnly: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(teacher.subjects);
  const [pending, start] = useTransition();
  const dirty = selected.length !== teacher.subjects.length || selected.some((s) => !teacher.subjects.includes(s));

  const toggle = (s: string) => setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  function save() {
    start(async () => {
      const res = await saveTeacherSubjects({ teacherId: teacher.id, subjects: selected });
      if (res.ok) {
        toast.success(`Saved ${teacher.name}'s subjects`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <li className="space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold text-text">{teacher.name}</h2>
        <Button size="sm" onClick={save} disabled={readOnly || pending || !dirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={`Subjects for ${teacher.name}`}>
        {DOUBT_SUBJECTS.map((s) => {
          const on = selected.includes(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s)}
              disabled={readOnly || pending}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface-2 text-text-muted hover:text-text",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
    </li>
  );
}

/** HOD / Academic Office: which subjects each teacher answers. Subjects with no teacher can't receive private doubts. */
export function SubjectMapping({ teachers, readOnly = false }: { teachers: TeacherRef[]; readOnly?: boolean }) {
  const uncovered = DOUBT_SUBJECTS.filter((s) => !teachers.some((t) => t.subjects.includes(s)));
  return (
    <div className="space-y-5">
      {uncovered.length > 0 && (
        <p className="rounded-2xl border border-warning-fg/30 bg-warning-bg p-3 text-sm font-semibold text-warning-fg">
          No teacher yet for: {uncovered.join(", ")}. Students cannot send private doubts for these.
        </p>
      )}
      <ul className="space-y-4">
        {teachers.map((t) => (
          <TeacherRow key={`${t.id}-${t.subjects.join("|")}`} teacher={t} readOnly={readOnly} />
        ))}
      </ul>
    </div>
  );
}
