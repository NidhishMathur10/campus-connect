// Quick Phase 3 sanity check: schema column + department visibility under RLS.
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
  const col = await admin.from("ticket_events").select("is_internal").limit(1);
  console.log(col.error ? `✗ ticket_events.is_internal missing — re-run supabase/schema.sql (${col.error.message})` : "✔ ticket_events.is_internal exists");

  for (const id of ["suresh", "ramesh", "rao"]) {
    const c = await asUser(id);
    const { data, error } = await c.from("tickets").select("ticket_no, department, module");
    if (error) throw error;
    const depts = [...new Set(data!.map((t) => t.department))];
    console.log(`${id}: ${data!.length} tickets visible via RLS · departments: ${depts.join(", ")}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
