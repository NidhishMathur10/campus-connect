import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { inBackground } from "./send";
import { deliverAlert } from "./lost-found-notify";
import { clip, PERSON_COLUMNS, peopleByIds, type Person } from "./notify";

/**
 * "Ask my teacher" notifications (CLAUDE.md §21): in-app bell + email (+ WhatsApp when enabled),
 * through the same helpers as tickets. Fire-and-forget; never fails the user's action.
 */

const studentPath = (id: string) => `/education/doubts/${id}`;
const teacherPath = (id: string) => `/doubts/${id}`;

export interface DoubtRef {
  id: string;
  subject: string;
  title: string;
}

/** The teacher(s) mapped to a subject. */
async function teachersOf(subject: string): Promise<Person[]> {
  const { data } = await createAdminClient().from("profiles").select(PERSON_COLUMNS).eq("role", "teacher").contains("subjects", [subject]);
  return (data ?? []) as Person[];
}

/** A student asked (or followed up): tell the subject's teachers. */
export function notifyDoubtToTeachers(t: DoubtRef, studentName: string, followUp: boolean): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "doubt",
      recipients: await teachersOf(t.subject),
      template: followUp ? "doubt_followup" : "doubt_asked",
      title: followUp ? `Follow-up on a ${t.subject} doubt` : `New ${t.subject} doubt from ${studentName}`,
      message: `${studentName} ${followUp ? "replied to" : "asked"}: "${clip(t.title, 120)}". Open your doubt inbox to reply.`,
      rows: [["Subject", t.subject], ["Doubt", t.title]],
      buttonLabel: "Open the doubt",
      path: teacherPath(t.id),
    });
  });
}

/** 48h without an answer: remind the subject's teachers. */
export function notifyDoubtReminder(t: DoubtRef): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "doubt",
      recipients: await teachersOf(t.subject),
      template: "doubt_reminder",
      title: `Reminder: unanswered ${t.subject} doubt`,
      message: `A student's doubt "${clip(t.title, 120)}" has been waiting for an answer for more than 48 hours.`,
      rows: [["Subject", t.subject], ["Doubt", t.title]],
      buttonLabel: "Answer it",
      path: teacherPath(t.id),
    });
  });
}

/** A teacher replied: tell the student. */
export function notifyDoubtReply(t: DoubtRef, studentId: string, teacherName: string): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "doubt",
      recipients: await peopleByIds([studentId]),
      template: "doubt_reply",
      title: `${teacherName} replied to your doubt`,
      message: `${teacherName} answered your ${t.subject} doubt "${clip(t.title, 120)}".`,
      rows: [["Subject", t.subject], ["Doubt", t.title]],
      buttonLabel: "Read the reply",
      path: studentPath(t.id),
    });
  });
}

/** A teacher asks to share the answer on the public board (anonymously). */
export function notifyDoubtPublicRequest(t: DoubtRef, studentId: string, teacherName: string): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "doubt",
      recipients: await peopleByIds([studentId]),
      template: "doubt_public_request",
      title: `${teacherName} would like to share your doubt`,
      message: `${teacherName} would like to post "${clip(t.title, 100)}" and the answer on the public Q&A board without your name. You decide: open the doubt to agree or decline.`,
      buttonLabel: "Review and decide",
      path: studentPath(t.id),
    });
  });
}

/** The student agreed and it is now on the Q&A board: tell the teacher who answered. */
export function notifyDoubtPublished(t: DoubtRef, teacherId: string, questionId: string): void {
  inBackground(async () => {
    await deliverAlert({
      kind: "doubt",
      recipients: await peopleByIds([teacherId]),
      template: "doubt_published",
      title: "Your answer is now public",
      message: `The student agreed, so "${clip(t.title, 100)}" and your answer are on the Q&A board, anonymously.`,
      buttonLabel: "View on the Q&A board",
      path: `/qa/${questionId}`,
    });
  });
}
