import "server-only";
import { isFaculty } from "@/config/faculty";
import type { Role } from "@/config/roles";
import { MODULE_LABELS } from "@/config/routing";
import { ESCALATION_REASON_LABELS } from "@/config/statuses";
import { formatLocation } from "@/lib/format";
import { hotspotLabel } from "@/lib/hotspots";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Escalation, Ticket } from "@/lib/types";
import { isDemoEmail } from "@/config/demo-accounts";
import { collegeEmailDomain } from "@/config/email";
import { notify, type NewNotification } from "@/lib/notifications";
import { confidentialPayload, jobPayload, reporterTicketPath, staffTicketPath } from "@/lib/push/messages";
import { deliverPush, pushToPeople } from "@/lib/push/send";
import { deliver, inBackground } from "./send";
import { appUrl, renderEmail, type EmailContent } from "./templates";
import { deliverWhatsApp } from "./whatsapp";

/**
 * Which emails go out when (CLAUDE.md §15). Every `notify*` function is fire-and-forget:
 * it runs after the response and can never fail the user's action.
 *
 * Every event also goes out on WhatsApp (Twilio sandbox) to people who opted in on /profile, and for
 * seeded demo accounts to DEMO_NOTIFY_WHATSAPP. The same safety rule applies on both channels.
 *
 * Safety rule: confidential Safety & Security tickets only ever email the reporter, the
 * Anti-Ragging Committee and the Dean, and the email says nothing about the report itself.
 */

export interface Person {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_optin: boolean;
  role: Role;
  department: string | null;
}

export const PERSON_COLUMNS = "id, full_name, email, phone, whatsapp_optin, role, department";

export async function peopleByIds(ids: string[]): Promise<Person[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { data } = await createAdminClient()
    .from("profiles")
    .select(PERSON_COLUMNS)
    .in("id", unique);
  return (data ?? []) as Person[];
}

async function loadTicket(id: string): Promise<Ticket | null> {
  const { data } = await createAdminClient().from("tickets").select("*").eq("id", id).maybeSingle();
  return (data as Ticket | null) ?? null;
}

/** The reporter and everyone who joined with "Me too" / was merged in. */
async function reporterAndFollowers(ticket: Pick<Ticket, "id" | "reporter_id">): Promise<Person[]> {
  const { data } = await createAdminClient().from("ticket_followers").select("user_id").eq("ticket_id", ticket.id);
  return peopleByIds([ticket.reporter_id, ...(data ?? []).map((f) => f.user_id as string)]);
}

/** Where a reporter tracks the ticket: students /tickets, faculty /reports. */
function trackLink(person: Pick<Person, "role">, ticketNo: string): string {
  return appUrl(`${isFaculty(person.role) ? "/reports" : "/tickets"}/${ticketNo}`);
}

const staffLink = (ticketNo: string) => appUrl(`/staff?t=${ticketNo}`);

/** "within 24 hours" from the ticket's SLA window. */
function expectedTime(t: Pick<Ticket, "created_at" | "sla_due_at">): string {
  if (!t.sla_due_at) return "As soon as possible";
  const hours = Math.round((new Date(t.sla_due_at).getTime() - new Date(t.created_at).getTime()) / 3_600_000);
  if (hours <= 0) return "As soon as possible";
  if (hours >= 48) return `within ${Math.round(hours / 24)} days`;
  return `within ${hours} hour${hours === 1 ? "" : "s"}`;
}

export async function send(
  person: Pick<Person, "email">,
  template: string,
  ticketId: string | null,
  subject: string,
  content: EmailContent,
) {
  if (!person.email) return;
  const { html, text } = renderEmail(content);
  await deliver({ to: person.email, template, ticketId, subject, html, text });
}

/** Short plain-text WhatsApp message (under 500 characters). Opted-in people and demo accounts only. */
export async function wa(person: Person, template: string, ticketId: string | null, body: string) {
  const demo = !!person.email && isDemoEmail(person.email, collegeEmailDomain());
  if (!demo && !(person.whatsapp_optin && person.phone)) return;
  await deliverWhatsApp({
    to: person.phone,
    demoFor: demo ? person.full_name : null,
    template,
    ticketId,
    body: body.length > 440 ? `${body.slice(0, 437)}...` : body,
  });
}

/** In-app bell rows; a failure never affects the email/WhatsApp sends around it. */
export async function notifyInApp(rows: NewNotification[]) {
  try {
    await notify(rows);
  } catch (err) {
    console.error("[notify] in-app", err instanceof Error ? err.message : err);
  }
}

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------------------------------------------------------------------------
// Confidential Safety & Security tickets: generic emails, no details, ever.
// ---------------------------------------------------------------------------
async function sendConfidential(ticket: Pick<Ticket, "id" | "ticket_no" | "reporter_id" | "department"> & { assigned_to?: string | null }) {
  const admin = createAdminClient();
  const [reporters, arcRes, deanRes] = await Promise.all([
    peopleByIds([ticket.reporter_id]),
    admin.from("profiles").select(PERSON_COLUMNS).eq("role", "arc").eq("department", ticket.department),
    admin.from("profiles").select(PERSON_COLUMNS).eq("role", "dean"),
  ]);
  const staff = [...((arcRes.data ?? []) as Person[]), ...((deanRes.data ?? []) as Person[])];
  const seen = new Set<string>();
  for (const person of [...reporters, ...staff]) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    const mine = person.id === ticket.reporter_id;
    const link = mine ? trackLink(person, ticket.ticket_no) : staffLink(ticket.ticket_no);
    await send(
      person,
      "confidential_update",
      ticket.id,
      `Update on ${mine ? "your " : ""}confidential report ${ticket.ticket_no}`,
      {
        preheader: "Open the app to view.",
        heading: `Update on ${mine ? "your " : ""}confidential report ${ticket.ticket_no}`,
        paragraphs: ["For privacy, details are never sent by email. Please open the app to view the update."],
        button: { label: "Open CampusConnect", url: link },
        footer: "This is a confidential notification from CampusConnect.",
      },
    );
    await wa(
      person,
      "confidential_update",
      ticket.id,
      `Update on ${mine ? "your " : ""}confidential report ${ticket.ticket_no} — open the app to view: ${link}`,
    );
    await deliverPush(
      person,
      mine
        ? { title: `Update on your confidential report ${ticket.ticket_no}`, body: "Open the app to view.", tag: ticket.ticket_no, url: reporterTicketPath(person.role, ticket.ticket_no) }
        : confidentialPayload(person.role, ticket.ticket_no, false),
      { template: "confidential_update", ticketId: ticket.id },
    );
  }
  // The security officer the case was handed to hears about it too (push only, no details).
  if (ticket.assigned_to && !seen.has(ticket.assigned_to)) {
    const [officer] = await peopleByIds([ticket.assigned_to]);
    if (officer) {
      await deliverPush(officer, confidentialPayload(officer.role, ticket.ticket_no, true), { template: "confidential_update", ticketId: ticket.id });
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Ticket created → reporter
// ---------------------------------------------------------------------------
export function notifyTicketCreated(ticketId: string): void {
  inBackground(async () => {
    const t = await loadTicket(ticketId);
    if (!t) return;
    if (t.is_confidential) return sendConfidential(t);
    const [reporter] = await peopleByIds([t.reporter_id]);
    if (!reporter) return;
    await send(reporter, "ticket_created", t.id, `Ticket ${t.ticket_no} created: ${t.title}`, {
      preheader: `We received your report. Your ticket number is ${t.ticket_no}.`,
      heading: `Your ticket ${t.ticket_no} is created`,
      paragraphs: [`Hi ${reporter.full_name}, your report has been sent to the right team.`],
      rows: [
        ["Ticket number", t.ticket_no],
        ["Summary", t.summary ?? t.title],
        ["Category", t.category],
        ["Department", t.department],
        ["Priority", t.priority],
        ["Where", formatLocation(t)],
        ["Expected fix", expectedTime(t)],
      ],
      button: { label: "Track your ticket", url: trackLink(reporter, t.ticket_no) },
    });
    await wa(
      reporter,
      "ticket_created",
      t.id,
      `CampusConnect: ticket ${t.ticket_no} created. ${clip(t.title, 80)}. Status: Submitted, ${expectedTime(t)}. Track: ${trackLink(reporter, t.ticket_no)}`,
    );
    await deliverPush(
      reporter,
      { title: `Ticket ${t.ticket_no} created`, body: clip(t.title, 100), tag: t.ticket_no, url: reporterTicketPath(reporter.role, t.ticket_no) },
      { template: "ticket_created", ticketId: t.id },
    );
  });
}

// ---------------------------------------------------------------------------
// 2. Status updates → reporter + all followers (Assigned / In Progress / Resolved)
// ---------------------------------------------------------------------------
type TrackedStatus = "Assigned" | "In Progress" | "Resolved";

const STATUS_TEMPLATES: Record<TrackedStatus, { template: string; heading: (no: string) => string; intro: string }> = {
  Assigned: {
    template: "ticket_assigned",
    heading: (no) => `${no} has been assigned`,
    intro: "A staff member has been assigned to your ticket.",
  },
  "In Progress": {
    template: "ticket_in_progress",
    heading: (no) => `Work has started on ${no}`,
    intro: "Our team has started working on your ticket.",
  },
  Resolved: {
    template: "ticket_resolved",
    heading: (no) => `${no} was marked resolved`,
    intro: "Staff say this is fixed. Please confirm it, so we can close the ticket, or tell us if the problem is still there.",
  },
};

export function notifyTicketStatus(ticketId: string, status: string, note?: string | null): void {
  if (!(status in STATUS_TEMPLATES)) return;
  inBackground(async () => {
    const t = await loadTicket(ticketId);
    if (!t) return;
    if (t.is_confidential) return sendConfidential(t);
    const cfg = STATUS_TEMPLATES[status as TrackedStatus];
    const resolved = status === "Resolved";
    for (const person of await reporterAndFollowers(t)) {
      await send(person, cfg.template, t.id, `${cfg.heading(t.ticket_no)}: ${t.title}`, {
        preheader: cfg.intro,
        heading: cfg.heading(t.ticket_no),
        paragraphs: [`Hi ${person.full_name}, ${cfg.intro.charAt(0).toLowerCase()}${cfg.intro.slice(1)}`],
        rows: [
          ["Ticket", `${t.ticket_no} · ${t.title}`],
          ["Status", status],
          ["Department", t.department],
        ],
        quote: note?.trim() ? { label: "Note from staff", text: note.trim() } : undefined,
        button: {
          label: resolved ? "Please confirm it's fixed" : "Track your ticket",
          url: trackLink(person, t.ticket_no),
        },
      });
      const noteText = note?.trim() ? ` Note: ${clip(note.trim(), 100)}` : "";
      await wa(
        person,
        cfg.template,
        t.id,
        `CampusConnect: ${t.ticket_no} (${clip(t.title, 60)}) is now ${status}.${noteText}${
          resolved ? " Reply in the app to confirm it's fixed." : ""
        } Track: ${trackLink(person, t.ticket_no)}`,
      );
      await deliverPush(
        person,
        {
          title: `${t.ticket_no} is now ${status}`,
          body: resolved ? `${clip(t.title, 70)} · Please confirm it's fixed` : clip(t.title, 100),
          tag: t.ticket_no,
          url: reporterTicketPath(person.role, t.ticket_no),
        },
        { template: cfg.template, ticketId: t.id },
      );
    }
  });
}

// ---------------------------------------------------------------------------
// 3. Merged → reporter + followers of the duplicate
// ---------------------------------------------------------------------------
export function notifyTicketMerged(duplicateId: string, originalNo: string): void {
  inBackground(async () => {
    const t = await loadTicket(duplicateId);
    if (!t || t.is_confidential) return;
    for (const person of await reporterAndFollowers(t)) {
      await send(person, "ticket_merged", t.id, `${t.ticket_no} was merged into ${originalNo}`, {
        preheader: `The same problem was already reported as ${originalNo}.`,
        heading: `${t.ticket_no} merged into ${originalNo}`,
        paragraphs: [
          `Hi ${person.full_name}, the same problem had already been reported, so staff merged your ticket into ${originalNo}. You will get every update on that ticket.`,
        ],
        rows: [
          ["Your ticket", `${t.ticket_no} · ${t.title}`],
          ["Now tracked as", originalNo],
        ],
        button: { label: `Track ${originalNo}`, url: trackLink(person, originalNo) },
      });
      await wa(
        person,
        "ticket_merged",
        t.id,
        `CampusConnect: ${t.ticket_no} was merged into ${originalNo} (same problem already reported). Status: Merged. Track: ${trackLink(person, originalNo)}`,
      );
    }
  });
}

// ---------------------------------------------------------------------------
// 4. Assigned staff
// ---------------------------------------------------------------------------
export function notifyStaffAssigned(ticketId: string, assigneeId: string, opts: { reopened?: boolean } = {}): void {
  inBackground(async () => {
    const t = await loadTicket(ticketId);
    if (!t) return;
    const [staff] = await peopleByIds([assigneeId]);
    if (!staff) return;
    // Confidential reports: only the reporter, arc and dean are ever emailed; the assigned officer gets a content-free push.
    if (t.is_confidential) {
      await deliverPush(staff, confidentialPayload(staff.role, t.ticket_no, true), { template: "confidential_update", ticketId: t.id });
      return;
    }
    await send(staff, "staff_assigned", t.id, `New ticket assigned to you: ${t.ticket_no}`, {
      preheader: `${t.priority} priority · ${t.category}`,
      heading: "New ticket assigned to you",
      paragraphs: [`Hi ${staff.full_name}, ${t.ticket_no} is now yours.`],
      rows: [
        ["Ticket", `${t.ticket_no} · ${t.title}`],
        ["Summary", t.summary ?? t.title],
        ["Category", t.category],
        ["Priority", t.priority],
        ["Where", formatLocation(t)],
        ["Due", expectedTime(t)],
      ],
      button: { label: "Open ticket", url: staffLink(t.ticket_no) },
    });
    await wa(
      staff,
      "staff_assigned",
      t.id,
      `CampusConnect: ${t.ticket_no} assigned to you. ${clip(t.title, 70)} (${t.priority}, ${t.category}). Open: ${staffLink(t.ticket_no)}`,
    );
    await notifyInApp([
      {
        user_id: staff.id,
        kind: "ticket",
        title: `New ticket assigned to you: ${t.ticket_no}`,
        body: t.title,
        link: `/staff?t=${t.ticket_no}`,
      },
    ]);
    await deliverPush(staff, jobPayload(t, staff.role, formatLocation(t), opts.reopened ? "reopened" : "new"), {
      template: "staff_assigned",
      ticketId: t.id,
    });
  });
}

// ---------------------------------------------------------------------------
// 4b. SLA reminders, re-assignments, "no staff available" → staff / warden / Dean (email + WhatsApp + in-app)
// ---------------------------------------------------------------------------
/**
 * One alert for a handful of staff. Confidential Safety tickets: only the Anti-Ragging Committee
 * (own department) and the Dean can be reached, and the text never says anything about the report.
 */
export function notifyStaffAlert(opts: {
  ticketId: string;
  recipientIds: string[];
  /** email_log template name, e.g. "sla_reminder". */
  template: string;
  title: string;
  message: string;
  /**
   * Phone push for this alert: "job" = "New job: ...", "reminder" = "Almost due: ...", "text" = the title + message.
   * Omit for no push (the alert stays email / WhatsApp / bell only).
   */
  push?: "job" | "reminder" | "text";
  /** Only push (no email, WhatsApp or bell), e.g. a warden's reply on a ticket. */
  pushOnly?: boolean;
}): void {
  inBackground(async () => {
    const t = await loadTicket(opts.ticketId);
    if (!t) return;
    let people = await peopleByIds(opts.recipientIds);
    const confidential = t.is_confidential;
    if (confidential) {
      people = people.filter((p) => p.role === "dean" || (p.role === "arc" && p.department === t.department));
    }
    const title = confidential ? `Update on confidential report ${t.ticket_no}` : opts.title;
    const message = confidential ? "For privacy, details are never sent by email. Please open the app to view." : opts.message;
    const link = staffLink(t.ticket_no);
    if (opts.push) {
      const push = opts.push;
      await pushToPeople(
        people,
        (p) =>
          confidential
            ? confidentialPayload(p.role, t.ticket_no, false)
            : push === "text"
              ? { title: clip(title, 80), body: clip(opts.message, 140), tag: t.ticket_no, url: staffTicketPath(p.role, t.ticket_no) }
              : jobPayload(t, p.role, formatLocation(t), push === "job" ? "new" : "reminder"),
        { template: confidential ? "confidential_update" : opts.template, ticketId: t.id },
      );
    }
    if (opts.pushOnly) return;
    for (const person of people) {
      await send(person, opts.template, t.id, title, {
        preheader: message,
        heading: title,
        paragraphs: [`Hi ${person.full_name}, ${message}`],
        rows: confidential
          ? undefined
          : [
              ["Ticket", `${t.ticket_no} · ${t.title}`],
              ["Priority", t.priority],
              ["Department", t.department],
              ["Where", formatLocation(t)],
            ],
        button: { label: "Open ticket", url: link },
      });
      await wa(person, opts.template, t.id, `CampusConnect: ${clip(title, 120)} ${confidential ? "Open the app to view" : clip(message, 160)}. ${link}`);
    }
    await notifyInApp(
      people.map((p) => ({ user_id: p.id, kind: "ticket" as const, title, body: confidential ? null : message, link: `/staff?t=${t.ticket_no}` })),
    );
  });
}

// ---------------------------------------------------------------------------
// 5. Escalation → Dean / HOD (once per escalation, after the AI brief is written)
// ---------------------------------------------------------------------------
/** Awaited version: runs inside the background brief job. Claims the escalation so it is emailed only once. */
export async function sendEscalationEmail(escalationId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: claimed, error } = await admin
      .from("escalations")
      .update({ emailed_at: new Date().toISOString() })
      .eq("id", escalationId)
      .is("emailed_at", null)
      .select("*");
    if (error) {
      console.error("[email] escalation claim:", error.message);
      return;
    }
    const esc = (claimed?.[0] ?? null) as Escalation | null;
    if (!esc) return;

    const ticket = esc.ticket_id ? await loadTicket(esc.ticket_id) : null;
    const { data: recipients } = await admin
      .from("profiles")
      .select(PERSON_COLUMNS)
      .eq("role", esc.target_role);
    const people = (recipients ?? []) as Person[];
    const link = appUrl(`/escalations/${esc.id}`);

    if (ticket?.is_confidential) {
      // Only the Dean is ever told, and only that there is an update.
      for (const p of people.filter((x) => x.role === "dean")) {
        await send(p, "confidential_update", ticket.id, `Update on confidential report ${ticket.ticket_no}`, {
          heading: `Update on confidential report ${ticket.ticket_no}`,
          paragraphs: ["For privacy, details are never sent by email. Please open the app to view the update."],
          button: { label: "Open CampusConnect", url: link },
          footer: "This is a confidential notification from CampusConnect.",
        });
        await wa(p, "confidential_update", ticket.id, `Update on confidential report ${ticket.ticket_no} — open the app to view: ${link}`);
        await deliverPush(
          p,
          { title: `Update on confidential report ${ticket.ticket_no}`, body: "Open the app to view.", tag: ticket.ticket_no, url: `/escalations/${esc.id}` },
          { template: "confidential_update", ticketId: ticket.id },
        );
      }
      return;
    }

    const where = esc.hotspot_key ? hotspotLabel(esc.hotspot_key) : ticket ? `${ticket.category} · ${formatLocation(ticket)}` : "Campus";
    for (const p of people) {
      await send(p, "escalation", ticket?.id ?? null, `Escalation: ${esc.headline ?? ESCALATION_REASON_LABELS[esc.reason]} (${where})`, {
        preheader: esc.headline ?? "A new escalation needs your attention.",
        heading: esc.headline ?? "New escalation needs your attention",
        paragraphs: [
          `Hi ${p.full_name}, a new ${MODULE_LABELS[esc.module]} escalation was raised.`,
          ...(esc.recommended_action ? [`Recommended action: ${esc.recommended_action}`] : []),
        ],
        rows: [
          ["Reason", ESCALATION_REASON_LABELS[esc.reason]],
          ["Where", where],
          ["People affected", String(esc.affected_count)],
        ],
        quote: esc.brief ? { label: "AI brief", text: esc.brief } : undefined,
        button: { label: "Review escalation", url: link },
      });
      await wa(
        p,
        "escalation",
        ticket?.id ?? null,
        `CampusConnect escalation: ${clip(esc.headline ?? ESCALATION_REASON_LABELS[esc.reason], 90)} (${clip(where, 60)}). ${
          ticket ? `Ticket ${ticket.ticket_no}. ` : ""
        }Review: ${link}`,
      );
      await deliverPush(
        p,
        {
          title: `Escalation: ${clip(esc.headline ?? ESCALATION_REASON_LABELS[esc.reason], 60)}`,
          body: `${clip(where, 90)} · ${esc.affected_count} affected`,
          tag: ticket?.ticket_no ?? `esc-${esc.id}`,
          url: `/escalations/${esc.id}`,
        },
        { template: "escalation", ticketId: ticket?.id ?? null },
      );
    }
  } catch (err) {
    console.error("[email] escalation:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// 6. Teacher answered a student's question
// ---------------------------------------------------------------------------
export function notifyTeacherAnswered(questionId: string, authorId: string, questionTitle: string, teacherName: string): void {
  inBackground(async () => {
    const [author] = await peopleByIds([authorId]);
    if (!author || author.role !== "student") return;
    await send(author, "teacher_answered", null, "A teacher answered your question", {
      preheader: questionTitle,
      heading: "A teacher answered your question",
      paragraphs: [`Hi ${author.full_name}, ${teacherName} replied to your question.`],
      rows: [["Question", questionTitle]],
      button: { label: "Read the answer", url: appUrl(`/education/qa/${questionId}`) },
    });
    await wa(
      author,
      "teacher_answered",
      null,
      `CampusConnect: ${teacherName} answered your question "${clip(questionTitle, 80)}". Read: ${appUrl(`/education/qa/${questionId}`)}`,
    );
  });
}
