import "./load-env";
import { createClient } from "@supabase/supabase-js";
import { DEMO_ACCOUNTS } from "../src/config/demo-accounts";
import { STAFF_NAV } from "../src/components/shell/nav-items";
import { canAccess, ROLE_HOME, type Role } from "../src/config/roles";

const BASE = process.env.CHECK_BASE ?? "http://localhost:3111";
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ref = new URL(URL_).hostname.split(".")[0];

async function cookieFor(loginId: string) {
  const sb = createClient(URL_, KEY);
  const { data, error } = await sb.auth.signInWithPassword({ email: `${loginId}@campusconnect.app`, password: "demo1234" });
  if (error || !data.session) throw new Error(error?.message ?? "no session");
  const val = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const chunks = val.match(/.{1,3000}/g)!;
  return chunks.length === 1 ? `${name}=${val}` : chunks.map((c, i) => `${name}.${i}=${c}`).join("; ");
}

async function main() {
const rows: string[][] = [];
const seen = new Set<string>();
for (const a of DEMO_ACCOUNTS) {
  if (a.role === "student" || seen.has(a.role)) continue;
  seen.add(a.role);
  const role = a.role as Exclude<Role, "student">;
  const cookie = await cookieFor(a.loginId);
  const expected = STAFF_NAV[role].map((i) => i.href);
  // Rendered sidebar
  const home = await fetch(BASE + (ROLE_HOME[role] === "/jobs" ? "/staff" : ROLE_HOME[role]), { headers: { cookie }, redirect: "manual" });
  const html = await home.text();
  const aside = html.match(/<aside[\s\S]*?<\/aside>/)?.[0] ?? "";
  const rendered = [...aside.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]).slice(1); // first is the logo
  const sidebarOk = JSON.stringify(rendered) === JSON.stringify(expected);
  // Each link loads
  const bad: string[] = [];
  for (const href of expected) {
    const r = await fetch(BASE + href, { headers: { cookie }, redirect: "manual" });
    if (r.status !== 200) bad.push(`${href}:${r.status}${r.headers.get("location") ? "→" + r.headers.get("location") : ""}`);
    else if (!canAccess(role, href)) bad.push(`${href}:not in ROUTE_ACCESS`);
  }
  // Forbidden pages must bounce
  const forbidden = ["/subjects", "/lost-found/desk"].filter((p) => !canAccess(role, p));
  for (const p of forbidden) {
    const r = await fetch(BASE + p, { headers: { cookie }, redirect: "manual" });
    if (!(r.status >= 300 && r.status < 400 && (r.headers.get("location") ?? "").includes("denied=1"))) bad.push(`${p} not blocked (${r.status})`);
  }
  rows.push([role, a.loginId, String(expected.length), sidebarOk ? "PASS" : `FAIL (${rendered.join(",")})`, bad.length ? "FAIL " + bad.join("; ") : "PASS"]);
}
console.log("| role | login | items | sidebar matches | links load / blocks |\n|---|---|---|---|---|");
for (const r of rows) console.log("| " + r.join(" | ") + " |");
}
main().catch((e) => { console.error(e); process.exit(1); });
