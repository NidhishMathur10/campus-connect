import type { LoanStatus } from "@/config/sports";

/** Row types mirroring the equipment tables in supabase/schema.sql. */
export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  total_qty: number;
  condition_notes: string | null;
  photo_url: string | null;
  active: boolean;
  under_repair: boolean;
  created_at: string;
}

export interface EquipmentLoan {
  id: string;
  item_id: string;
  student_id: string;
  qty: number;
  status: LoanStatus;
  pickup_code: string | null;
  reserved_for: string;
  due_at: string;
  issued_at: string | null;
  returned_at: string | null;
  return_condition: "good" | "damaged" | null;
  notes: string | null;
  ticket_id: string | null;
  reminded_at: string | null;
  overdue_notified_at: string | null;
  created_at: string;
}

/** An item plus how many are free right now. */
export interface ItemWithAvailability extends EquipmentItem {
  /** total_qty - (reserved + issued + overdue), never below 0. */
  available: number;
}

/** A loan with the item name (and, on the desk only, who has it). */
export interface LoanView extends EquipmentLoan {
  item_name: string;
  item_category: string;
  student_name?: string;
  student_roll?: string | null;
  ticket_no?: string | null;
}
