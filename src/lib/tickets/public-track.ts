import "server-only";
import type { Role } from "@/config/roles";
import type { Priority, TicketModule } from "@/config/routing";
import type { TicketStatus } from "@/config/statuses";
import { createAdminClient } from "@/lib/supabase/admin";

/** What public tracking (no login, ticket number only) may reveal — nothing else (CLAUDE.md §13). */
export interface PublicTicket {
  ticket_no: string;
  module: TicketModule;
  category: string;
  building: string | null;
  status: TicketStatus;
  priority: Priority;
  created_at: string;
}

export interface PublicEvent {
  status: TicketStatus;
  /** Generic role, never a name: "Student", "Estate staff", "Warden"… */
  actor: string;
  at: string;
}

export type PublicTrackResponse =
  | { ok: true; ticket: PublicTicket; events: PublicEvent[] }
  | { ok: false; error: string };

const DEPARTMENT_SHORT: Record<string, string> = {
  "Estate / Maintenance": "Estate staff",
  "Electrical Maintenance": "Electrical staff",
  Housekeeping: "Housekeeping staff",
  "IT Cell": "IT Cell staff",
  "Mess Committee": "Mess Committee",
  "Lab In-charge": "Lab staff",
  "Library Staff": "Library staff",
  "Academic Office": "Academic Office",
  "Warden (manual triage)": "Warden",
};

function genericActor(role: Role | null, department: string): string {
  switch (role) {
    case "student":
      return "Student";
    case "teacher":
      return "Faculty";
    case "staff":
    case "academic_office":
      return DEPARTMENT_SHORT[department] ?? "Staff";
    case "warden":
      return "Warden";
    case "dean":
      return "Dean's office";
    case "hod":
      return "Head of Department";
    case null:
      return "CampusConnect";
    default:
      return "Staff";
  }
}

/**
 * Ticket + public timeline for a ticket number. Safety & Security tickets are never
 * returned, so they look exactly like a number that doesn't exist.
 */
export async function publicTrack(
  ticketNo: string,
): Promise<{ ticket: PublicTicket; events: PublicEvent[] } | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("tickets")
    .select("id, ticket_no, module, category, building, status, priority, created_at, department")
    .eq("ticket_no", ticketNo)
    .neq("module", "security")
    .eq("teacher_complaint", false)
    .maybeSingle();
  if (!data) return null;

  const { data: rows } = await admin
    .from("ticket_events")
    .select("to_status, actor_role, created_at")
    .eq("ticket_id", data.id)
    .eq("is_internal", false)
    .not("to_status", "is", null)
    .order("created_at", { ascending: true });

  const { id: _id, department, ...ticket } = data as PublicTicket & { id: string; department: string };
  void _id;
  return {
    ticket,
    events: (rows ?? []).map((e) => ({
      status: e.to_status as TicketStatus,
      actor: genericActor(e.actor_role as Role | null, department),
      at: e.created_at as string,
    })),
  };
}
