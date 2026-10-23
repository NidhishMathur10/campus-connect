// Quick DB sanity check (phases 3–4): schema columns + department visibility under RLS.
import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { loginIdToEmail } from "../src/config/college";
import { DEMO_PASSWORD } from "../src/config/demo-accounts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function asUser(loginId: string) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: loginIdToEmail(loginId), password: DEMO_PASSWORD });
  if (error) throw new Error(`login ${loginId}: ${error.message}`);
  return c;
}

async function main() {
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const checks: [string, PromiseLike<{ error: { message: string } | null }>][] = [
    ["ticket_events.is_internal (phase 3)", admin.from("ticket_events").select("is_internal").limit(1)],
    ["escalations brief columns (phase 4)", admin.from("escalations").select("headline, urgency_reason, brief_model, brief_count, resolved_at").limit(1)],
    ["hotspot_insights table (phase 4)", admin.from("hotspot_insights").select("hotspot_key").limit(1)],
    ["Q&A moderation columns (phase 5B)", admin.from("questions").select("pending_review, hidden, hidden_reason, answered_at").limit(1)],
    ["answer_votes table (phase 5B)", admin.from("answer_votes").select("answer_id").limit(1)],
    ["notifications table (phase 5B)", admin.from("notifications").select("id").limit(1)],
  ];
  let missing = false;
  for (const [label, q] of checks) {
    const { error } = await q;
    console.log(error ? `✗ ${label} — re-run supabase/schema.sql (${error.message})` : `✔ ${label}`);
    missing ||= !!error;
  }

  for (const id of ["suresh", "ramesh", "rao"]) {
    const c = await asUser(id);
    const { data, error } = await c.from("tickets").select("ticket_no, department, status");
    if (error) throw error;
    const depts = [...new Set(data!.map((t) => t.department))];
    const closed = data!.filter((t) => t.status === "Closed").length;
    console.log(`${id}: ${data!.length} tickets visible via RLS (${closed} closed) · departments: ${depts.join(", ")}`);
  }
  if (!missing) {
    const { data } = await admin.from("escalations").select("reason, status, affected_count, headline");
    console.log(`escalations: ${JSON.stringify(data)}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
