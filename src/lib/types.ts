import type { Category, Priority, TicketModule } from "@/config/routing";
import type { TicketScope } from "@/config/locations";
import type { Role } from "@/config/roles";
import type { DuplicateStatus, TicketEventType, TicketStatus } from "@/config/statuses";

/** Row types mirroring supabase/schema.sql. */

export interface Profile {
  id: string;
  full_name: string;
  roll_no: string | null;
  /** College email used for notifications (null until set). */
  email: string | null;
  /** WhatsApp number in E.164 (+919876543210), null until set. */
  phone: string | null;
  whatsapp_optin: boolean;
  role: Role;
  department: string | null;
  hostel: string | null;
  wing: string | null;
  room: string | null;
  created_at: string;
}

export interface FieldMeta {
  confidence: number;
  reason: string;
}

export interface AiMeta {
  model?: string;
  extracted_issue?: string;
  is_safety_hazard?: boolean;
  category?: FieldMeta;
  department?: FieldMeta;
  priority?: FieldMeta;
  /** Complaint moderation: "unchecked" = the AI was unavailable (staff see "Not moderated"). */
  moderation?: "passed" | "unchecked";
  /** Safety & Security: the photo shows people; only arc / dean may see it. */
  photo_has_people?: boolean;
  [key: string]: unknown;
}

export interface PhotoAnalysis {
  observed: string;
  matches_complaint: boolean;
  notes: string;
}

export interface Ticket {
  id: string;
  ticket_no: string;
  module: TicketModule;
  /** Safety & Security: visible only to reporter, arc, assigned security officer and dean (RLS). */
  is_confidential: boolean;
  /** Safety & Security: only arc and dean may see who reported it. */
  hide_identity: boolean;
  reporter_id: string;
  original_text: string;
  language: string;
  english_text: string | null;
  title: string;
  summary: string | null;
  category: Category | string;
  department: string;
  priority: Priority;
  ai_meta: AiMeta | null;
  photo_url: string | null;
  photo_analysis: PhotoAnalysis | null;
  building: string | null;
  floor: string | null;
  spot: string | null;
  machine_id: string | null;
  /** Hostel room number ("204"). Null for common areas and non-hostel tickets. */
  room_no: string | null;
  /** How many rooms the issue affects (hostel). Null = not applicable / not asked. */
  scope: TicketScope | null;
  status: TicketStatus;
  details_incomplete: boolean;
  assigned_to: string | null;
  duplicate_of: string | null;
  duplicate_score: number | null;
  duplicate_reason: string | null;
  duplicate_status: DuplicateStatus;
  escalated: boolean;
  reopen_count: number;
  rating: number | null;
  feedback: string | null;
  sla_due_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: Role | null;
  type: TicketEventType;
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
  note: string | null;
  /** Staff-only note (hidden from students by RLS). */
  is_internal: boolean;
  created_at: string;
}

export type EscalationReason = "recurring" | "reopened" | "sla_breach" | "manual" | "safety";
export type EscalationStatus = "open" | "acknowledged" | "resolved";

export interface Escalation {
  id: string;
  module: TicketModule;
  ticket_id: string | null;
  hotspot_key: string | null;
  reason: EscalationReason;
  target_role: "dean" | "hod";
  headline: string | null;
  brief: string | null;
  recommended_action: string | null;
  urgency_reason: string | null;
  brief_model: string | null;
  brief_count: number | null;
  affected_count: number;
  status: EscalationStatus;
  directive: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HotspotInsight {
  hotspot_key: string;
  module: TicketModule;
  recommendation: string;
  ticket_count: number;
  model: string | null;
  generated_at: string;
}

/** Soft-delete + moderation fields shared by questions, answers and comments. */
export interface Moderated {
  /** Gemini moderation was unavailable when posted — a teacher should check it. */
  pending_review: boolean;
  /** Hidden by a teacher (soft delete). */
  hidden: boolean;
  hidden_reason: string | null;
}

export interface Question extends Moderated {
  id: string;
  author_id: string;
  subject: string;
  title: string;
  body: string;
  status: "open" | "answered";
  best_answer_id: string | null;
  upvotes: number;
  /** When the first teacher answer was posted. */
  answered_at: string | null;
  created_at: string;
}

export interface Answer extends Moderated {
  id: string;
  question_id: string;
  author_id: string;
  body: string;
  upvotes: number;
  created_at: string;
}

export interface AnswerComment extends Moderated {
  id: string;
  answer_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  kind: "answer" | "best_answer" | "comment" | "ticket";
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}
