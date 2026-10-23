import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AppNotification } from "@/lib/types";

export type NewNotification = Pick<AppNotification, "user_id" | "kind" | "title" | "body" | "link">;

/**
 * Adds rows to the in-app bell (delivered live via Realtime). Never throws — a missing
 * notification must not fail the action that caused it. Ticket status notifications
 * are created by a database trigger on ticket_events instead (see schema.sql).
 */
export async function notify(rows: NewNotification[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await createAdminClient().from("notifications").insert(rows);
  if (error) console.error("[notify]", error.message);
}
