import "server-only";
import type { Role } from "@/config/roles";
import { DOUBT_SUBJECTS } from "@/config/subjects";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DoubtMessage, DoubtThread } from "./types";

/**
 * Reads for "Ask my teacher". Service role + explicit access checks (`canAccessThread`), mirroring the
 * RLS in schema.sql: a thread is for its student, the teacher(s) mapped to its subject, and the HOD.
 */

export interface Viewer {
  id: string;
  role: Role;
  subjects: string[];
}

export interface PersonRef {
  id: string;
  name: string;
  roll_no: string | null;
}

export const isStudentOf = (t: Pick<DoubtThread, "student_id">, v: Viewer) => v.role === "student" && t.student_id === v.id;
export const isTeacherOf = (t: Pick<DoubtThread, "subject">, v: Viewer) => v.role === "teacher" && v.subjects.includes(t.subject);

export function canAccessThread(t: Pick<DoubtThread, "student_id" | "subject">, v: Viewer): boolean {
  return isStudentOf(t, v) || isTeacherOf(t, v) || v.role === "hod";
}

export interface TeacherRef {
  id: string;
  name: string;
  subjects: string[];
}

/** Every teacher with the subjects they answer (subjects page, subject picker). */
export async function listTeachers(): Promise<TeacherRef[]> {
  const { data } = await createAdminClient().from("profiles").select("id, full_name, subjects").eq("role", "teacher").order("full_name");
  return (data ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string, subjects: (p.subjects as string[] | null) ?? [] }));
}

/** subject -> teacher names, for every subject a student can ask about. */
export function teachersBySubject(teachers: TeacherRef[]): Record<string, string[]> {
  return Object.fromEntries(DOUBT_SUBJECTS.map((s) => [s, teachers.filter((t) => t.subjects.includes(s)).map((t) => t.name)]));
}

async function peopleRefs(ids: string[]): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data } = await createAdminClient().from("profiles").select("id, full_name, roll_no").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, { id: p.id as string, name: p.full_name as string, roll_no: (p.roll_no as string | null) ?? null }]));
}

export interface DoubtListItem extends DoubtThread {
  student: PersonRef | null;
  last_preview: string;
  teachers: string[];
  message_count: number;
  /** Hours since the last message (computed on the server). */
  waiting_hours: number;
}

async function decorate(threads: DoubtThread[]): Promise<DoubtListItem[]> {
  if (threads.length === 0) return [];
  const admin = createAdminClient();
  const [students, { data: msgs }, teachers] = await Promise.all([
    peopleRefs(threads.map((t) => t.student_id)),
    admin.from("doubt_messages").select("thread_id, sender, body, created_at").in("thread_id", threads.map((t) => t.id)).order("created_at", { ascending: false }),
    listTeachers(),
  ]);
  const byThread = new Map<string, { sender: string; body: string }[]>();
  for (const m of msgs ?? []) {
    const list = byThread.get(m.thread_id as string) ?? [];
    list.push({ sender: m.sender as string, body: m.body as string });
    byThread.set(m.thread_id as string, list);
  }
  return threads.map((t) => {
    const list = (byThread.get(t.id) ?? []).filter((m) => m.sender !== "system");
    return {
      ...t,
      student: students.get(t.student_id) ?? null,
      last_preview: list[0]?.body.slice(0, 140) ?? "",
      teachers: teachers.filter((x) => x.subjects.includes(t.subject)).map((x) => x.name),
      message_count: list.length,
      waiting_hours: Math.floor((Date.now() - new Date(t.last_message_at).getTime()) / 3_600_000),
    };
  });
}

export async function listMyDoubts(studentId: string): Promise<DoubtListItem[]> {
  const { data } = await createAdminClient().from("doubt_threads").select("*").eq("student_id", studentId).order("last_message_at", { ascending: false }).limit(100);
  return decorate((data ?? []) as DoubtThread[]);
}

/** Teacher / HOD inbox: unanswered first (longest waiting at the top), then answered, then closed. */
export async function listInbox(viewer: Viewer): Promise<DoubtListItem[]> {
  let query = createAdminClient().from("doubt_threads").select("*").order("last_message_at", { ascending: true }).limit(300);
  if (viewer.role === "teacher") {
    if (viewer.subjects.length === 0) return [];
    query = query.in("subject", viewer.subjects);
  } else if (viewer.role !== "hod") return [];
  const { data } = await query;
  const rank = { open: 0, answered: 1, closed: 2 } as const;
  const items = await decorate((data ?? []) as DoubtThread[]);
  return items.sort((a, b) => rank[a.status] - rank[b.status] || (a.status === "open" ? a.last_message_at.localeCompare(b.last_message_at) : b.last_message_at.localeCompare(a.last_message_at)));
}

/** Count of doubts waiting for this teacher (faculty home, nav). */
export async function countUnanswered(viewer: Viewer): Promise<number> {
  if (viewer.role !== "teacher" || viewer.subjects.length === 0) return 0;
  const { count } = await createAdminClient()
    .from("doubt_threads")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .in("subject", viewer.subjects);
  return count ?? 0;
}

export interface ThreadView {
  thread: DoubtThread;
  messages: (DoubtMessage & { author_name: string | null })[];
  student: PersonRef | null;
  teachers: string[];
  /** The viewer's role in this thread. */
  as: "student" | "teacher" | "hod";
  /** The message the teacher proposed to publish (consent card). */
  publicMessage: (DoubtMessage & { author_name: string | null }) | null;
}

export async function loadThread(id: string, viewer: Viewer): Promise<ThreadView | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("doubt_threads").select("*").eq("id", id).maybeSingle();
  const thread = data as DoubtThread | null;
  if (!thread || !canAccessThread(thread, viewer)) return null;

  const { data: msgRows } = await admin.from("doubt_messages").select("*").eq("thread_id", id).order("created_at", { ascending: true });
  const msgs = (msgRows ?? []) as DoubtMessage[];
  const [people, teachers] = await Promise.all([
    peopleRefs([thread.student_id, ...msgs.map((m) => m.author_id ?? "")]),
    listTeachers(),
  ]);
  const messages = msgs.map((m) => ({ ...m, author_name: m.author_id ? (people.get(m.author_id)?.name ?? null) : null }));
  return {
    thread,
    messages,
    // Students see their own name; teachers and the HOD see name + roll number.
    student: people.get(thread.student_id) ?? null,
    teachers: teachers.filter((t) => t.subjects.includes(thread.subject)).map((t) => t.name),
    as: isStudentOf(thread, viewer) ? "student" : viewer.role === "hod" ? "hod" : "teacher",
    publicMessage: messages.find((m) => m.id === thread.public_message_id) ?? null,
  };
}
