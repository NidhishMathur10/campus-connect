import "server-only";
import { audienceMatchesProfile, NOTICE_TYPE_LABELS } from "@/config/notices";
import { ROUTING } from "@/config/routing";
import { formatDateTime } from "@/lib/format";
import { pushToPeople } from "@/lib/push/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Notice } from "@/lib/types";
import { inBackground } from "./send";
import { clip, notifyInApp, PERSON_COLUMNS, peopleByIds, type Person } from "./notify";
import { deliverAlert } from "./lost-found-notify";

/**
 * Notice board notifications (CLAUDE.md §23): every new notice rings the in-app bell of its audience;
 * email (+ WhatsApp when enabled) goes out only for urgent alerts and known issues. Same helpers, demo
 * redirects and email_log as tickets. Fire-and-forget: can never fail the poster's action.
 */

/** Where a student reads a notice (the module page that lists it). */
export const noticePath = (n: Pick<Notice, "id" | "module">) =>
  `${n.module === "academic" ? "/education/notices" : "/hostel/notices"}?n=${n.id}`;

type StudentRow = Person & { hostel: string | null; wing: string | null; room: string | null };

async function audienceOf(n: Pick<Notice, "audience">): Promise<Person[]> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select(`${PERSON_COLUMNS}, hostel, wing, room`)
    .eq("role", "student");
  return ((data ?? []) as StudentRow[]).filter((s) => audienceMatchesProfile(n.audience, s));
}

/** The department that fixes this kind of known issue (from the routing guide), if the notice names a category. */
function departmentOf(n: Pick<Notice, "module" | "category">): string | null {
  if ((n.module !== "hostel" && n.module !== "academic") || !n.category) return null;
  return ROUTING[n.module].find((r) => r.category === n.category)?.departments[0] ?? null;
}

/** Phone alert for the staff who will get the complaints: "Known issue: ..." for their department. */
async function pushToDepartment(n: Notice, title: string, message: string) {
  const department = departmentOf(n);
  if (!department) return;
  const { data } = await createAdminClient().from("profiles").select("id, full_name, role").eq("role", "staff").eq("department", department);
  await pushToPeople(
    (data ?? []) as { id: string; full_name: string; role: string }[],
    () => ({ title: clip(title, 80), body: clip(message, 140), tag: `notice-${n.id}`, url: "/jobs" }),
    { template: n.type === "urgent" ? "notice_urgent" : "notice_known_issue" },
  );
}

const when = (iso: string | null) => (iso ? formatDateTime(iso) : null);

/** A notice was published: bell for the audience, email only for urgent alerts and known issues. */
export function notifyNoticePublished(n: Notice): void {
  inBackground(async () => {
    const recipients = await audienceOf(n);
    const label = NOTICE_TYPE_LABELS[n.type];
    const title = n.type === "urgent" ? `Urgent: ${n.title}` : n.type === "known_issue" ? `Known issue: ${n.title}` : `New ${label.toLowerCase()}: ${n.title}`;
    const message = n.summary || clip(n.body, 200);
    if (n.type === "urgent" || n.type === "known_issue") await pushToDepartment(n, title, message);
    if (recipients.length === 0) return;

    if (n.type !== "urgent" && n.type !== "known_issue") {
      await notifyInApp(recipients.map((p) => ({ user_id: p.id, kind: "notice" as const, title: clip(title, 120), body: clip(message, 160), link: noticePath(n) })));
      return;
    }
    const rows: [string, string][] = [["From", n.author_name]];
    if (n.category) rows.push(["Affects", n.category]);
    if (n.expected_fix_at) rows.push(["Expected fix", when(n.expected_fix_at)!]);
    await deliverAlert({
      recipients,
      kind: "notice",
      template: n.type === "urgent" ? "notice_urgent" : "notice_known_issue",
      title,
      message,
      rows,
      buttonLabel: "Read the notice",
      path: noticePath(n),
    });
  });
}

/** A known issue was marked Resolved: everyone who said "Me too" hears about it. */
export function notifyKnownIssueResolved(n: Notice, followerIds: string[], note: string | null): void {
  if (followerIds.length === 0) return;
  inBackground(async () => {
    await deliverAlert({
      recipients: await peopleByIds(followerIds),
      kind: "notice",
      template: "notice_resolved",
      title: `Resolved: ${n.title}`,
      message: note?.trim() || `${n.title} has been fixed. If you still have the problem, please report it again.`,
      rows: [["From", n.author_name]],
      buttonLabel: "View the update",
      path: noticePath(n),
    });
  });
}
