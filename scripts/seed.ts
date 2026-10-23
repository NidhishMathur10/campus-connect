/**
 * npm run seed — creates demo accounts + realistic tickets, escalations and Q&A.
 * Re-runnable: wipes ALL tickets, escalations and Q&A first, then rebuilds them.
 * Demo accounts are updated in place (password reset to demo1234).
 */
import "./load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginIdToEmail } from "../src/config/college";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "../src/config/demo-accounts";
import {
  computeSlaDueAt,
  getRoutingRule,
  MODULE_LABELS,
  type Priority,
  type TicketModule,
} from "../src/config/routing";
import { CONFIDENTIAL_REPORTER } from "../src/config/safety";
import type { TicketEventType, TicketStatus } from "../src/config/statuses";
import type { Role } from "../src/config/roles";

const H = 3600_000;
const D = 24 * H;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✖ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const db: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

// ---------------------------------------------------------------------------
// 1. Accounts
// ---------------------------------------------------------------------------
interface SeededUser {
  id: string;
  name: string;
  role: Role;
}
const users = new Map<string, SeededUser>(); // loginId -> user

async function seedAccounts() {
  const existing = new Map<string, string>(); // email -> id
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    data.users.forEach((u) => u.email && existing.set(u.email.toLowerCase(), u.id));
    if (data.users.length < 1000) break;
  }

  for (const a of DEMO_ACCOUNTS) {
    const email = loginIdToEmail(a.loginId);
    const user_metadata = {
      full_name: a.fullName,
      roll_no: a.rollNo ?? null,
      hostel: a.hostel ?? null,
      wing: a.wing ?? null,
      room: a.room ?? null,
    };
    const app_metadata = { role: a.role, department: a.department ?? null };

    let id = existing.get(email);
    if (id) {
      const { error } = await db.auth.admin.updateUserById(id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata,
        app_metadata,
      });
      if (error) throw new Error(`update ${email}: ${error.message}`);
    } else {
      const { data, error } = await db.auth.admin.createUser({
        email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata,
        app_metadata,
      });
      if (error || !data.user) throw new Error(`create ${email}: ${error?.message}`);
      id = data.user.id;
    }

    // Upsert the profile too (covers users created before the trigger existed).
    must(
      await db.from("profiles").upsert({
        id,
        full_name: a.fullName,
        roll_no: a.rollNo ?? null,
        role: a.role,
        department: a.department ?? null,
        hostel: a.hostel ?? null,
        wing: a.wing ?? null,
        room: a.room ?? null,
      }),
      `profile ${email}`,
    );
    users.set(a.loginId, { id, name: a.fullName, role: a.role });
  }
  console.log(`✔ ${DEMO_ACCOUNTS.length} demo accounts ready (password: ${DEMO_PASSWORD})`);
}

function u(loginId: string): SeededUser {
  const user = users.get(loginId);
  if (!user) throw new Error(`Unknown demo account ${loginId}`);
  return user;
}

// ---------------------------------------------------------------------------
// 2. Wipe old demo data
// ---------------------------------------------------------------------------
async function wipe() {
  must(await db.from("escalations").delete().not("id", "is", null), "wipe escalations");
  must(await db.from("hotspot_insights").delete().not("hotspot_key", "is", null), "wipe hotspot insights");
  must(await db.from("tickets").delete().not("id", "is", null), "wipe tickets");
  must(await db.from("questions").delete().not("id", "is", null), "wipe questions");
  const { error } = await db.rpc("reset_ticket_seq");
  if (error) console.warn(`! Could not reset ticket numbers (${error.message}). Did you run schema.sql?`);
  console.log("✔ Cleared old tickets, escalations and Q&A");
}

// ---------------------------------------------------------------------------
// 3. Tickets
// ---------------------------------------------------------------------------
interface SeedTicket {
  key: string;
  module: TicketModule;
  reporter: string;
  text: string;
  language?: "en" | "hi";
  english?: string;
  title: string;
  summary: string;
  issue: string;
  category: string;
  department?: string;
  priority?: Priority;
  hazard?: boolean;
  building: string;
  floor?: string;
  spot?: string;
  machine?: string;
  ago: number;
  status: TicketStatus;
  assignee?: string;
  reopenCount?: number;
  rating?: number;
  feedback?: string;
  detailsIncomplete?: boolean;
  escalated?: boolean;
  duplicateOf?: string;
  duplicateScore?: number;
  duplicateReason?: string;
  photo?: { observed: string; matches: boolean; notes: string };
  /** Safety & Security: confidential report / "hide my name". */
  confidential?: boolean;
  hideIdentity?: boolean;
}

const TICKETS: SeedTicket[] = [
  // --- Hotspot: 4 plumbing tickets, New Hostel 2nd floor washroom (→ recurring escalation)
  {
    key: "hot1", module: "hostel", reporter: "2616400101", ago: 26 * D,
    text: "Flush in the 2nd floor washroom of New Hostel (cubicle 3) keeps overflowing, water all over the floor.",
    title: "Overflowing flush in 2nd floor washroom", summary: "The flush in cubicle 3 of the New Hostel 2nd floor washroom overflows and floods the floor. Needs a plumber to fix the cistern valve.",
    issue: "Overflowing toilet flush (cubicle 3)", category: "Plumbing", building: "New Hostel", floor: "2nd", spot: "Washroom, cubicle 3",
    status: "Closed", assignee: "ramesh", rating: 4, feedback: "Fixed the same day, thanks!", escalated: true,
  },
  {
    key: "hot2", module: "hostel", reporter: "2616400101", ago: 18 * D,
    text: "Pipe under the wash basin in 2nd floor washroom NH is leaking, bucket kept below is full every morning",
    title: "Leaking pipe under wash basin", summary: "The pipe under a wash basin in the New Hostel 2nd floor washroom leaks steadily overnight. Pipe joint likely needs replacing.",
    issue: "Leaking pipe joint under wash basin", category: "Plumbing", building: "New Hostel", floor: "2nd", spot: "Washroom, wash basin row",
    status: "Resolved", assignee: "mahesh", escalated: true,
  },
  {
    key: "hot3", module: "hostel", reporter: "2616400103", ago: 9 * D,
    text: "Drain is blocked in New Hostel 2nd floor washroom, dirty water collecting near the bathing area",
    title: "Blocked drain in 2nd floor washroom", summary: "The floor drain near the bathing area of the New Hostel 2nd floor washroom is blocked and dirty water is collecting.",
    issue: "Blocked floor drain", category: "Plumbing", building: "New Hostel", floor: "2nd", spot: "Washroom, bathing area",
    status: "In Progress", assignee: "ramesh", escalated: true,
  },
  {
    key: "hot4", module: "hostel", reporter: "2616400101", ago: 2 * D, language: "hi",
    text: "न्यू हॉस्टल दूसरी मंज़िल के वॉशरूम में नल से लगातार पानी टपक रहा है, पूरी रात आवाज़ आती है",
    english: "The tap in the New Hostel 2nd floor washroom keeps dripping continuously; you can hear it all night.",
    title: "Tap dripping all night in washroom", summary: "A tap in the New Hostel 2nd floor washroom drips continuously through the night, wasting water. Needs a washer replacement.",
    issue: "Continuously dripping tap", category: "Plumbing", building: "New Hostel", floor: "2nd", spot: "Washroom",
    status: "Submitted", escalated: true,
  },
  // --- Overdue urgent sparking socket (→ sla_breach escalation)
  {
    key: "spark", module: "hostel", reporter: "2616400103", ago: 7 * H,
    text: "Socket near my study table is sparking when I plug in my charger and there is a burning smell. Room B-305.",
    title: "Sparking socket with burning smell", summary: "The wall socket near the study table in room B-305 sparks when a charger is plugged in and gives off a burning smell. Safety hazard — needs immediate isolation.",
    issue: "Sparking wall socket, burning smell", category: "Electricity", priority: "Urgent", hazard: true,
    building: "Old Hostel", floor: "3rd", spot: "Room B-305 (Boys Wing), socket near study table",
    status: "Assigned", assignee: "suresh", escalated: true,
    photo: { observed: "A scorched, blackened wall socket with melted plastic around one pin hole.", matches: true, notes: "Burn marks confirm sparking; do not use until repaired." },
  },
  // --- Open ticket a new demo complaint can duplicate
  {
    key: "tap1", module: "hostel", reporter: "2616400101", ago: 1 * D,
    text: "Tap leaking in New Hostel 1st floor washroom",
    title: "Tap leaking in 1st floor washroom", summary: "A tap in the New Hostel 1st floor washroom is leaking. Needs a plumber to check the washer or valve.",
    issue: "Leaking tap", category: "Plumbing", building: "New Hostel", floor: "1st", spot: "Washroom",
    status: "Submitted",
  },
  {
    key: "tapdup", module: "hostel", reporter: "2616400103", ago: 6 * H,
    text: "The tap near the mirror in NH 1st floor washroom won't stop dripping",
    title: "Dripping tap near mirror", summary: "The tap near the mirror in the New Hostel 1st floor washroom keeps dripping.",
    issue: "Dripping tap", category: "Plumbing", building: "New Hostel", floor: "1st", spot: "Washroom, near mirror",
    status: "Submitted", duplicateOf: "tap1", duplicateScore: 0.86,
    duplicateReason: "Same washroom (New Hostel 1st floor) and same problem — a leaking/dripping tap — reported a day earlier.",
  },
  // --- Other hostel tickets
  {
    key: "wifi", module: "hostel", reporter: "2616400102", ago: 3 * D,
    text: "Wifi keeps disconnecting every 10 minutes in the whole girls wing 1st floor, can't attend online classes",
    title: "Wi-Fi drops every 10 minutes", summary: "Wi-Fi disconnects roughly every 10 minutes across the entire Old Hostel Girls Wing 1st floor, affecting online classes. Likely an access-point issue.",
    issue: "Frequent Wi-Fi disconnections (whole floor)", category: "Internet", priority: "Medium",
    building: "Old Hostel", floor: "1st", spot: "Girls Wing, whole floor", status: "Assigned", assignee: "rohit",
  },
  {
    key: "laundry", module: "hostel", reporter: "2616400101", ago: 12 * D, machine: "NH-G-W2",
    text: "Washing machine NH-G-W2 stops in the middle of the cycle and doesn't drain the water",
    title: "Machine NH-G-W2 stops mid-cycle", summary: "Washing machine NH-G-W2 on the New Hostel ground floor stops mid-cycle and does not drain.",
    issue: "Washing machine stops mid-cycle, no drain", category: "Laundry", building: "New Hostel", floor: "Ground", spot: "Laundry area",
    status: "Closed", assignee: "mahesh", rating: 5,
  },
  {
    key: "mess1", module: "hostel", reporter: "2616400103", ago: 5 * D,
    text: "Dal was watery and rice was undercooked at lunch today in old hostel mess",
    title: "Watery dal, undercooked rice at lunch", summary: "At lunch in the Old Hostel Mess the dal was watery and the rice undercooked.",
    issue: "Poor food quality at lunch", category: "Mess Food", building: "Old Hostel Mess", spot: "Lunch",
    status: "Resolved", assignee: "sharma",
  },
  {
    key: "mess2", module: "hostel", reporter: "2616400102", ago: 1 * D, language: "hi",
    text: "आज रात के खाने में सब्ज़ी में बाल निकला, गर्ल्स मेस में साफ़-सफ़ाई का ध्यान नहीं रखा जा रहा",
    english: "A hair was found in the vegetable at dinner tonight; hygiene is not being maintained in the Girls Mess.",
    title: "Hair found in dinner sabzi", summary: "A student found a hair in the vegetable dish at dinner in the Girls Mess and reports poor hygiene. Kitchen staff hygiene (hair nets) should be checked.",
    issue: "Hair in food — hygiene lapse at dinner", category: "Mess Food", priority: "High", building: "Girls Mess", spot: "Dinner",
    status: "Resolved", assignee: "sharma",
  },
  {
    key: "garbage", module: "hostel", reporter: "2616400103", ago: 15 * D,
    text: "Garbage bin in 3rd floor corridor not emptied for 3 days, really smelly",
    title: "Corridor bin not emptied for 3 days", summary: "The garbage bin in the Old Hostel Boys Wing 3rd floor corridor hasn't been emptied for three days and smells.",
    issue: "Overflowing garbage bin", category: "Cleanliness", building: "Old Hostel", floor: "3rd", spot: "Boys Wing corridor",
    status: "Closed", assignee: "kamla", rating: 3, feedback: "Cleaned, but it took a while.",
  },
  {
    key: "geyser", module: "hostel", reporter: "2616400102", ago: 8 * D,
    text: "No hot water from the geyser in 2nd floor girls washroom since morning",
    title: "Geyser not heating water", summary: "The geyser in the Old Hostel Girls Wing 2nd floor washroom has not been giving hot water since the morning.",
    issue: "Geyser not working", category: "Water Supply", building: "Old Hostel", floor: "2nd", spot: "Girls Wing washroom",
    status: "Resolved", assignee: "ramesh",
  },
  {
    key: "cupboard", module: "hostel", reporter: "2616400101", ago: 4 * D,
    text: "Cupboard door hinge in room 214 broke and the door fell off",
    title: "Cupboard door fell off", summary: "The cupboard door hinge in New Hostel room 214 is broken and the door has come off.",
    issue: "Broken cupboard hinge", category: "Room Repair", building: "New Hostel", floor: "2nd", spot: "Room 214",
    status: "Assigned", assignee: "mahesh",
  },
  {
    key: "gym", module: "hostel", reporter: "2616400103", ago: 6 * D,
    text: "Treadmill belt is slipping and two 10kg dumbbells are missing from the gym",
    title: "Treadmill slipping, dumbbells missing", summary: "In the gym, a treadmill belt slips during use and two 10 kg dumbbells are missing.",
    issue: "Faulty treadmill belt; missing dumbbells", category: "Gym", building: "Gym", floor: "Basement", spot: "Cardio area",
    status: "Submitted",
  },
  {
    key: "court", module: "hostel", reporter: "2616400101", ago: 10 * D,
    text: "Basketball court net is torn and one floodlight is not working, can't play in the evening",
    title: "Torn basketball net, floodlight out", summary: "At the Sports Complex the basketball court net is torn and one floodlight is off, making evening play difficult.",
    issue: "Torn net and dead floodlight", category: "Sports", building: "Sports Complex", spot: "Basketball court",
    status: "In Progress", assignee: "ramesh",
  },
  {
    key: "lights", module: "hostel", reporter: "2616400102", ago: 20 * D,
    text: "Two tube lights flickering in the common room on the ground floor of the girls wing",
    title: "Flickering tube lights in common room", summary: "Two tube lights in the Old Hostel Girls Wing ground floor common room are flickering.",
    issue: "Flickering tube lights", category: "Electricity", building: "Old Hostel", floor: "Ground", spot: "Girls Wing common room",
    status: "Closed", assignee: "dinesh", rating: 5,
  },
  {
    key: "lan", module: "hostel", reporter: "2616400103", ago: 6 * D,
    text: "LAN port in my room B-305 is dead, only me, others on floor are fine",
    title: "LAN port not working in B-305", summary: "The LAN port in Old Hostel room B-305 has no connection; only this room is affected.",
    issue: "Dead LAN port (single room)", category: "Internet", building: "Old Hostel", floor: "3rd", spot: "Room B-305",
    status: "Resolved", assignee: "rohit",
  },
  {
    key: "cooler", module: "hostel", reporter: "2616400101", ago: 11 * D,
    text: "RO water cooler on ground floor is giving warm water and leaking from the bottom",
    title: "Water cooler warm and leaking", summary: "The RO water cooler on the New Hostel ground floor dispenses warm water and leaks from the bottom. It was reported fixed once but the problem came back.",
    issue: "Water cooler not cooling, leaking", category: "Water Supply", priority: "Medium", building: "New Hostel", floor: "Ground", spot: "Water cooler near stairs",
    status: "Reopened", assignee: "ramesh", reopenCount: 1,
  },
  {
    key: "dogs", module: "hostel", reporter: "2616400102", ago: 2 * D,
    text: "Stray dogs are entering the girls wing corridor at night, we are scared to go to the washroom",
    title: "Stray dogs in girls wing at night", summary: "Stray dogs are getting into the Old Hostel Girls Wing corridor at night, making students afraid to walk to the washroom.",
    issue: "Stray dogs entering hostel corridor", category: "Other", priority: "Medium",
    building: "Old Hostel", floor: "Ground", spot: "Girls Wing corridor", status: "Submitted",
  },
  {
    key: "roaches", module: "hostel", reporter: "2616400103", ago: 3 * D,
    text: "Cockroaches seen near the water dispenser in old hostel mess",
    title: "Cockroaches near mess water dispenser", summary: "Cockroaches have been seen near the water dispenser in the Old Hostel Mess. Pest control needed.",
    issue: "Cockroach infestation near water dispenser", category: "Cleanliness", building: "Old Hostel Mess", spot: "Water dispenser",
    status: "Assigned", assignee: "sunita",
  },
  {
    key: "washer", module: "hostel", reporter: "2616400102", ago: 5 * H,
    text: "Washing machine not working",
    title: "Washing machine not working", summary: "A washing machine in the Old Hostel basement laundry is not working. The student did not provide the machine ID.",
    issue: "Washing machine not working (ID unknown)", category: "Laundry", building: "Old Hostel", floor: "Basement", spot: "Laundry area",
    status: "Submitted", detailsIncomplete: true,
  },
  // --- Academic tickets
  {
    key: "projector", module: "academic", reporter: "2616400101", ago: 2 * D,
    text: "Projector in B-204 shows 'no signal' from the HDMI cable, teacher couldn't show slides",
    title: "Projector shows no signal in B-204", summary: "The projector in classroom B-204 shows 'No signal' over HDMI, so lectures can't use slides.",
    issue: "Projector HDMI no signal", category: "Classroom Facilities", department: "Electrical Maintenance",
    building: "Block B", floor: "2nd", spot: "Classroom B-204", status: "Assigned", assignee: "dinesh",
  },
  {
    key: "benches", module: "academic", reporter: "2616400103", ago: 4 * D,
    text: "3 benches are broken in C-101, students have to stand during the lecture",
    title: "Broken benches in C-101", summary: "Three benches in classroom C-101 are broken and some students have to stand during lectures.",
    issue: "Broken benches", category: "Classroom Facilities", department: "Estate / Maintenance",
    building: "Block C", floor: "1st", spot: "Classroom C-101", status: "In Progress", assignee: "mahesh",
  },
  {
    key: "lab", module: "academic", reporter: "2616400102", ago: 7 * D,
    text: "Python and VS Code are not installed on about 10 systems in Lab D-2",
    title: "Python missing on 10 lab PCs", summary: "About 10 computers in Lab D-2 don't have Python and VS Code installed, blocking programming lab work.",
    issue: "Required software missing on lab PCs", category: "Lab Equipment",
    building: "Block D", floor: "Ground", spot: "Lab D-2", status: "Closed", assignee: "gupta", rating: 4,
  },
  {
    key: "attendance", module: "academic", reporter: "2616400101", ago: 3 * D,
    text: "My attendance for Basic Electrical shows 40% on the portal but I attended all classes",
    title: "Wrong attendance in Basic Electrical", summary: "The attendance portal shows 40% for Basic Electrical although the student says they attended all classes. Records need checking.",
    issue: "Attendance record error", category: "Academic Admin",
    building: "Block A", spot: "Attendance portal", status: "In Progress", assignee: "kapoor",
  },
  {
    key: "clash", module: "academic", reporter: "2616400103", ago: 1 * D,
    text: "Mathematics tutorial and Programming lab are clashing on Thursday 2pm for section B",
    title: "Timetable clash on Thursday 2pm", summary: "For section B, the Mathematics tutorial and the Programming lab are both scheduled on Thursday at 2 pm.",
    issue: "Timetable clash", category: "Academic Admin",
    building: "Block A", spot: "Section B timetable", status: "Submitted",
  },
  {
    key: "books", module: "academic", reporter: "2616400102", ago: 5 * D,
    text: "Only 2 copies of HC Verma physics book in library for 120 students",
    title: "Too few copies of HC Verma", summary: "The library has only two copies of the HC Verma Physics textbook for about 120 students.",
    issue: "Textbook shortage", category: "Library",
    building: "Block A", floor: "1st", spot: "Library", status: "Assigned", assignee: "nair",
  },
  {
    key: "libac", module: "academic", reporter: "2616400101", ago: 14 * D,
    text: "AC in the library reading hall is not cooling at all, very hot to sit and study",
    title: "Library reading hall AC not cooling", summary: "The AC in the library reading hall (Block A) isn't cooling, making it too hot to study.",
    issue: "AC not cooling in reading hall", category: "Library",
    building: "Block A", floor: "1st", spot: "Library reading hall",
    status: "Closed", assignee: "nair", rating: 2, feedback: "Took too long to fix.",
  },
  {
    key: "mic", module: "academic", reporter: "2616400103", ago: 9 * D,
    text: "Mic in A-301 lecture hall keeps crackling, can't hear the teacher at the back",
    title: "Crackling mic in A-301", summary: "The microphone in lecture hall A-301 crackles, so students at the back can't hear the teacher.",
    issue: "Faulty classroom microphone", category: "Classroom Facilities", department: "Electrical Maintenance",
    building: "Block A", floor: "3rd", spot: "Lecture hall A-301", status: "Resolved", assignee: "suresh",
  },
  // --- Safety & Security (CLAUDE.md §12)
  {
    key: "ragging", module: "security", reporter: "2616400103", ago: 20 * H, confidential: true, hideIdentity: true, escalated: true,
    text: "Some seniors from 3rd floor called us first years to their room at night and made us do push-ups and insulted us for an hour. It happened two nights in a row. I am scared to say no.",
    title: "First-years made to do push-ups at night", summary: "A first-year student reports that seniors called juniors to a room on the Old Hostel Boys Wing 3rd floor at night on two consecutive nights, forced them to do push-ups and insulted them for about an hour. The student feels afraid to refuse.",
    issue: "Ragging of first-years by seniors at night", category: "Ragging",
    building: "Old Hostel", floor: "3rd", spot: "Boys Wing, seniors' room (corridor end)", status: "Assigned", assignee: "mehra",
  },
  {
    key: "theft", module: "security", reporter: "2616400102", ago: 2 * D,
    text: "My phone was stolen from the girls wing common room while it was charging, around 9 pm yesterday. It's a blue Redmi with a cracked back cover.",
    title: "Phone stolen from common room", summary: "A blue Redmi phone (cracked back cover) was taken while charging in the Old Hostel Girls Wing common room around 9 pm.",
    issue: "Phone stolen while charging", category: "Theft / Lost item",
    building: "Old Hostel", floor: "Ground", spot: "Girls Wing common room", status: "In Progress", assignee: "yadav",
  },
  {
    key: "suspicious", module: "security", reporter: "2616400101", ago: 3 * H,
    text: "A man who is not a student was walking around the New Hostel ground floor corridor and trying door handles around 11 pm.",
    title: "Outsider trying door handles at night", summary: "An unknown adult, not a student, was seen walking the New Hostel ground floor corridor around 11 pm and trying room door handles.",
    issue: "Suspicious person trying doors", category: "Unauthorized entry / Suspicious person",
    building: "New Hostel", floor: "Ground", spot: "Corridor near rooms G-01 to G-20", status: "Submitted",
  },
];

const STATUS_ORDER: TicketStatus[] = ["Submitted", "Assigned", "In Progress", "Resolved", "Closed"];
const reached = (status: TicketStatus, step: TicketStatus) => {
  if (status === "Reopened") return ["Submitted", "Assigned", "In Progress", "Resolved"].includes(step);
  return STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf(step);
};

interface EventRow {
  ticket_id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: Role | null;
  type: TicketEventType;
  from_status: TicketStatus | null;
  to_status: TicketStatus | null;
  note: string | null;
  created_at: string;
}

async function seedTickets() {
  const ids = new Map<string, string>(); // key -> ticket id
  const events: EventRow[] = [];
  const now = Date.now();

  // Oldest first so ticket numbers go up with time.
  const ordered = [...TICKETS].sort((a, b) => b.ago - a.ago);

  for (const t of ordered) {
    const reporter = u(t.reporter);
    const assignee = t.assignee ? u(t.assignee) : null;
    const rule = getRoutingRule(t.module, t.category);
    const priority = t.priority ?? rule.defaultPriority;
    const department = t.department ?? rule.departments[0];
    const created = new Date(now - t.ago);
    const at = (fraction: number) => new Date(created.getTime() + t.ago * fraction).toISOString();
    const isResolved = t.status === "Resolved" || t.status === "Closed";

    const row = {
      module: t.module,
      reporter_id: reporter.id,
      original_text: t.text,
      language: t.language ?? "en",
      english_text: t.english ?? t.text,
      title: t.title,
      summary: t.summary,
      category: t.category,
      department,
      priority,
      ai_meta: {
        model: "seed",
        extracted_issue: t.issue,
        is_safety_hazard: !!t.hazard || !!rule.escalateToDean,
        category: { confidence: 0.92, reason: `Matches "${t.category}" in the routing guide (${rule.typicalIssues}).` },
        department: { confidence: 0.9, reason: `Routing guide sends ${t.category} to ${department}.` },
        priority: {
          confidence: t.hazard ? 0.97 : 0.8,
          reason: t.hazard
            ? "Safety hazard (sparking / burning smell) — Urgent overrides the category default."
            : priority === rule.defaultPriority
              ? `Default priority for ${t.category}.`
              : `Raised to ${priority} because it affects many students or hygiene/safety.`,
        },
      },
      photo_analysis: t.photo
        ? { observed: t.photo.observed, matches_complaint: t.photo.matches, notes: t.photo.notes }
        : null,
      building: t.building,
      floor: t.floor ?? null,
      spot: t.spot ?? null,
      machine_id: t.machine ?? null,
      status: t.status,
      is_confidential: !!t.confidential,
      hide_identity: !!t.hideIdentity,
      details_incomplete: !!t.detailsIncomplete,
      assigned_to: assignee?.id ?? null,
      duplicate_of: t.duplicateOf ? ids.get(t.duplicateOf) ?? null : null,
      duplicate_score: t.duplicateScore ?? null,
      duplicate_reason: t.duplicateReason ?? null,
      duplicate_status: t.duplicateOf ? "flagged" : "none",
      escalated: !!t.escalated,
      reopen_count: t.reopenCount ?? 0,
      rating: t.rating ?? null,
      feedback: t.feedback ?? null,
      sla_due_at: computeSlaDueAt(t.module, t.category, priority, created).toISOString(),
      resolved_at: isResolved ? at(0.7) : null,
      created_at: created.toISOString(),
      updated_at: at(isResolved ? 0.85 : 0.3),
    };

    const inserted = must(
      await db.from("tickets").insert(row).select("id, ticket_no").single(),
      `ticket ${t.key}`,
    ) as { id: string; ticket_no: string };
    ids.set(t.key, inserted.id);

    // ---- progress history
    const ev = (
      type: TicketEventType,
      actor: SeededUser | null,
      when: string,
      from: TicketStatus | null,
      to: TicketStatus | null,
      note: string | null,
    ) =>
      events.push({
        ticket_id: inserted.id,
        actor_id: actor?.id ?? null,
        actor_name: actor === reporter && t.hideIdentity ? CONFIDENTIAL_REPORTER : (actor?.name ?? "CampusConnect AI"),
        actor_role: actor?.role ?? null,
        type,
        from_status: from,
        to_status: to,
        note,
        created_at: when,
      });

    ev("created", reporter, created.toISOString(), null, "Submitted", `Reported via ${MODULE_LABELS[t.module]}${t.confidential ? " (confidential)" : ""}`);
    if (t.duplicateOf) {
      ev("duplicate_flagged", null, at(0.01), null, null, `Possible duplicate (${Math.round((t.duplicateScore ?? 0) * 100)}% similar). ${t.duplicateReason ?? ""}`);
    }
    if (assignee && reached(t.status, "Assigned")) {
      ev("assigned", assignee, at(0.1), null, null, `Assigned to ${assignee.name}`);
      ev("status_change", assignee, at(0.1), "Submitted", "Assigned", null);
    }
    if (assignee && reached(t.status, "In Progress")) {
      ev("status_change", assignee, at(0.3), "Assigned", "In Progress", "Work started on site.");
    }
    if (t.escalated) {
      ev(
        "escalated",
        null,
        t.key === "spark" ? at(0.6) : t.module === "security" ? at(0.001) : new Date(now - 2 * D).toISOString(),
        null,
        null,
        t.module === "security"
          ? "Escalated to the Dean of Student Affairs immediately because this is a safety report."
          : "Escalated to Dean of Student Affairs for priority attention.",
      );
    }
    if (assignee && reached(t.status, "Resolved")) {
      ev("status_change", assignee, at(0.7), "In Progress", "Resolved", "Fixed. Please confirm.");
    }
    if (t.status === "Reopened") {
      ev("reopened", reporter, at(0.8), "Resolved", "Reopened", "Still not fixed — same problem again.");
    }
    if (t.status === "Closed") {
      ev("status_change", reporter, at(0.85), "Resolved", "Closed", "Student confirmed the fix.");
      if (t.rating) ev("rating", reporter, at(0.86), null, null, `Rated ${t.rating}/5${t.feedback ? ` — "${t.feedback}"` : ""}`);
    }
  }

  must(await db.from("ticket_events").insert(events), "ticket events");

  // "Me too": Aarav has the same timetable clash Rahul reported.
  const clashId = ids.get("clash")!;
  const aarav = u("2616400101");
  must(await db.from("ticket_followers").insert({ ticket_id: clashId, user_id: aarav.id }), "follower");
  must(
    await db.from("ticket_events").insert({
      ticket_id: clashId,
      actor_id: aarav.id,
      actor_name: aarav.name,
      actor_role: "student",
      type: "me_too",
      note: "Aarav Mehta has the same problem (Me too).",
      created_at: new Date(now - 12 * H).toISOString(),
    }),
    "me too event",
  );

  console.log(`✔ ${TICKETS.length} tickets with ${events.length + 1} history events`);
  return ids;
}

// ---------------------------------------------------------------------------
// 4. Escalations (the same ones checkEscalations() would create)
// ---------------------------------------------------------------------------
async function seedEscalations(ids: Map<string, string>) {
  must(
    await db.from("escalations").insert([
      {
        module: "hostel",
        hotspot_key: "hostel|Plumbing|New Hostel|2nd",
        reason: "recurring",
        target_role: "dean",
        // unique reporters + followers across the 4 tickets (Aarav ×3, Rahul ×1)
        affected_count: 2,
        brief_count: 2,
        brief_model: "seed",
        headline: "New Hostel 2nd floor washroom keeps flooding",
        brief:
          "Four plumbing complaints in 26 days from the New Hostel 2nd floor washroom: an overflowing flush, a leaking basin pipe, a blocked drain and a tap dripping all night.\nTwo students have reported them; one is still open and one is in progress.\nEstate / Maintenance has fixed each fault one at a time, but a new one appears every week.",
        recommended_action:
          "Order a full plumbing audit of the New Hostel 2nd floor washroom (cisterns, basin pipes, floor drains, tap washers) this week instead of one-off repairs.",
        urgency_reason: "Water on the washroom floor is a slip hazard and the repeat repairs are wasting staff time.",
        created_at: new Date(Date.now() - 2 * D).toISOString(),
      },
      {
        module: "hostel",
        ticket_id: ids.get("spark"),
        reason: "sla_breach",
        target_role: "dean",
        affected_count: 1,
        brief_count: 1,
        brief_model: "seed",
        headline: "Sparking socket in B-305 still not fixed",
        brief:
          "An Urgent safety ticket — a sparking socket with a burning smell in Old Hostel room B-305 — was reported 7 hours ago.\nIts 2-hour deadline has passed; it is assigned to Suresh (Electrical Maintenance) but no work has started.\nOne student is affected and is still living in the room.",
        urgency_reason: "Sparking with a burning smell is a fire risk in an occupied room.",
        recommended_action:
          "Have Electrical Maintenance isolate the room's socket circuit immediately and replace the socket today; move the student's charging to a safe point meanwhile.",
        created_at: new Date(Date.now() - 3 * H).toISOString(),
      },
      {
        module: "security",
        ticket_id: ids.get("ragging"),
        reason: "safety",
        target_role: "dean",
        affected_count: 1,
        brief_count: 1,
        brief_model: "seed",
        headline: "Night-time ragging of first-years in Old Hostel",
        brief:
          "A first-year filed a confidential ragging report: seniors on the Old Hostel Boys Wing 3rd floor called juniors to their room on two nights in a row, made them do push-ups and insulted them for about an hour.\nThe student asked to keep their name hidden from investigating staff and says they are afraid to refuse.\nThe Anti-Ragging Committee (Dr. Mehra) has the case.",
        urgency_reason: "Ragging is a safety and legal matter, and it has already happened twice — it is likely to happen again tonight.",
        recommended_action:
          "Ask the Anti-Ragging Committee to meet the first-years today, have the warden do surprise night rounds on the 3rd floor, and act under the college anti-ragging policy.",
        created_at: new Date(Date.now() - 20 * H).toISOString(),
      },
    ]),
    "escalations",
  );
  console.log("✔ 3 escalations (recurring hotspot + SLA breach + safety report)");
}

// ---------------------------------------------------------------------------
// 5. Q&A
// ---------------------------------------------------------------------------
interface SeedQuestion {
  author: string;
  subject: string;
  title: string;
  body: string;
  ago: number;
  voters: string[];
  answers: { author: string; body: string; best?: boolean; comments?: { author: string; body: string }[] }[];
}

const QUESTIONS: SeedQuestion[] = [
  {
    author: "2616400101", subject: "Mathematics", ago: 6 * D, voters: ["2616400102", "2616400103"],
    title: "Fastest way to find eigenvalues of a 3×3 matrix?",
    body: "Solving the characteristic polynomial takes me forever in exams. Is there a shortcut for 3×3 matrices?",
    answers: [
      {
        author: "das", best: true,
        body: "Use the shortcut λ³ − (trace)λ² + (sum of principal 2×2 minors)λ − det = 0. Then try small integers (factors of det) as roots and divide out — usually one root is an integer, leaving a quadratic.",
      },
    ],
  },
  {
    author: "2616400102", subject: "Programming", ago: 5 * D, voters: ["2616400101", "2616400103"],
    title: "Difference between == and is in Python?",
    body: "Sometimes `a is b` is True and sometimes False even when the values look equal. When should I use which?",
    answers: [
      {
        author: "khan", best: true,
        body: "`==` compares values; `is` checks whether both names point to the *same object*. Use `is` only for singletons like `None` (`if x is None`). Small ints and short strings are cached, which is why `is` sometimes looks like it works — don't rely on it.",
        comments: [{ author: "2616400102", body: "That caching detail explains it, thank you!" }],
      },
      { author: "2616400103", body: "I think of it as: `==` → same content, `is` → same memory address (id)." },
    ],
  },
  {
    author: "2616400103", subject: "Physics", ago: 4 * D, voters: ["2616400101"],
    title: "Why does a charged particle move in a circle in a magnetic field?",
    body: "If the magnetic force acts on it, why doesn't the speed change?",
    answers: [
      {
        author: "das",
        body: "The magnetic force qv×B is always perpendicular to velocity, so it does no work — speed stays constant and only direction changes. A constant-magnitude force perpendicular to motion is exactly a centripetal force, giving r = mv/(qB).",
      },
    ],
  },
  {
    author: "2616400101", subject: "Basic Electrical", ago: 2 * D, voters: ["2616400103"],
    title: "Thevenin's theorem with a dependent source?",
    body: "How do we find R_th when the circuit has a dependent source? Can we still just short the sources?",
    answers: [],
  },
  {
    author: "2616400102", subject: "Introduction to AI", ago: 3 * D, voters: [],
    title: "Supervised vs unsupervised learning — simple example?",
    body: "I get the definitions but can't think of a clear real-life example of each.",
    answers: [
      {
        author: "khan",
        body: "Supervised: predicting house prices from past sales where the price (label) is known. Unsupervised: grouping customers by shopping behaviour when no groups are given — the algorithm finds clusters itself.",
      },
    ],
  },
  {
    author: "2616400103", subject: "Communication Skills", ago: 2 * D, voters: ["2616400102"],
    title: "Tips to reduce stage fear before presentations?",
    body: "My mind goes blank in the first minute of every presentation.",
    answers: [
      { author: "2616400102", body: "Memorise only your first two lines word-for-word. Once you get past the opening, it flows much easier." },
    ],
  },
  {
    author: "2616400101", subject: "Environmental Studies", ago: 1 * D, voters: [],
    title: "Is the carbon-footprint assignment individual or group?",
    body: "The brief doesn't say. Can we submit in pairs?",
    answers: [],
  },
  {
    author: "2616400102", subject: "General Studies", ago: 10 * H, voters: ["2616400101"],
    title: "Good resources for the quantitative aptitude section?",
    body: "Mid-sems are close — any books or websites you'd recommend?",
    answers: [],
  },
];

async function seedQuestions() {
  let answerCount = 0;
  for (const q of QUESTIONS) {
    const created = Date.now() - q.ago;
    const question = must(
      await db
        .from("questions")
        .insert({
          author_id: u(q.author).id,
          subject: q.subject,
          title: q.title,
          body: q.body,
          status: q.answers.length ? "answered" : "open",
          created_at: new Date(created).toISOString(),
        })
        .select("id")
        .single(),
      `question ${q.title}`,
    ) as { id: string };

    for (const [i, a] of q.answers.entries()) {
      const answer = must(
        await db
          .from("answers")
          .insert({
            question_id: question.id,
            author_id: u(a.author).id,
            body: a.body,
            created_at: new Date(created + (i + 1) * 3 * H).toISOString(),
          })
          .select("id")
          .single(),
        "answer",
      ) as { id: string };
      answerCount++;
      if (a.best) {
        must(await db.from("questions").update({ best_answer_id: answer.id }).eq("id", question.id), "best answer");
      }
      for (const c of a.comments ?? []) {
        must(
          await db.from("answer_comments").insert({
            answer_id: answer.id,
            author_id: u(c.author).id,
            body: c.body,
            created_at: new Date(created + (i + 2) * 3 * H).toISOString(),
          }),
          "comment",
        );
      }
    }

    if (q.voters.length) {
      must(
        await db
          .from("question_votes")
          .insert(q.voters.map((v) => ({ question_id: question.id, user_id: u(v).id }))),
        "votes",
      );
    }
  }
  console.log(`✔ ${QUESTIONS.length} Q&A questions, ${answerCount} answers`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log("Seeding CampusConnect…");
  await seedAccounts();
  await wipe();
  const ids = await seedTickets();
  await seedEscalations(ids);
  await seedQuestions();
  console.log("Done ✔  Log in with any demo account (password demo1234).");
}

main().catch((err) => {
  console.error("✖ Seed failed:", err instanceof Error ? err.message : err);
  console.error("  Did you run supabase/schema.sql and fill in .env.local?");
  process.exit(1);
});
