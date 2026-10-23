import type { DoubtPublicStatus, DoubtStatus } from "@/config/subjects";

export interface DoubtThread {
  id: string;
  student_id: string;
  subject: string;
  title: string;
  status: DoubtStatus;
  photo_path: string | null;
  photo_url: string | null;
  public_status: DoubtPublicStatus;
  public_message_id: string | null;
  public_question_id: string | null;
  last_sender: "student" | "teacher";
  last_message_at: string;
  reminder_sent_at: string | null;
  answered_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface DoubtMessage {
  id: string;
  thread_id: string;
  author_id: string | null;
  sender: "student" | "teacher" | "system";
  body: string;
  pending_review: boolean;
  created_at: string;
}
