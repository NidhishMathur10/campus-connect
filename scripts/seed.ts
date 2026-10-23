/**
 * npm run seed — creates demo accounts + realistic tickets, escalations and Q&A.
 * Re-runnable: wipes ALL tickets, escalations and Q&A first, then rebuilds them.
 * Demo accounts are updated in place (password reset to demo1234).
 */
import "./load-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loginIdToEmail } from "../src/config/college";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoAccountEmail } from "../src/config/demo-accounts";
import { collegeEmailDomain } from "../src/config/email";
import { currentTerm } from "../src/config/feedback";
import { defaultSubjectsFor } from "../src/config/subjects";
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
        email: demoAccountEmail(a, collegeEmailDomain()),
        roll_no: a.rollNo ?? null,
        role: a.role,
        department: a.department ?? null,
        hostel: a.hostel ?? null,
        wing: a.wing ?? null,
        room: a.room ?? null,
        on_leave: a.onLeave ?? false,
        preferred_buildings: a.preferredBuildings ?? [],
        last_assigned_at: null,
        subjects: a.role === "teacher" ? defaultSubjectsFor(a.loginId) : [],
      }),
      `profile ${email}`,
    );
    users.set(a.loginId, { id, name: a.fullName, role: a.role });
  }
  const notify = process.env.DEMO_NOTIFY_EMAIL?.trim();
  console.log(
    `✔ ${DEMO_ACCOUNTS.length} demo accounts ready (password: ${DEMO_PASSWORD}); emails @${collegeEmailDomain()}` +
      (notify ? `, all redirected to ${notify}` : " (set DEMO_NOTIFY_EMAIL to redirect them to your inbox)"),
  );
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
  // Cascades to matches, claims and the audit log.
  must(await db.from("lost_found_items").delete().not("id", "is", null), "wipe lost & found");
  // Cascades to doubt messages.
  must(await db.from("doubt_threads").delete().not("id", "is", null), "wipe doubts");
  must(await db.from("teacher_feedback").delete().not("id", "is", null), "wipe teacher feedback");
  must(await db.from("feedback_summaries").delete().not("subject", "is", null), "wipe feedback summaries");
  must(await db.from("identity_reveal_log").delete().not("id", "is", null), "wipe identity log");
  must(await db.from("questions").delete().not("id", "is", null), "wipe questions");
  must(await db.from("notifications").delete().not("id", "is", null), "wipe notifications");
  must(await db.from("email_log").delete().not("id", "is", null), "wipe email log");
  must(await db.from("moderation_log").delete().not("id", "is", null), "wipe moderation log");
  must(await db.from("app_settings").delete().not("key", "is", null), "wipe settings");
  const { error } = await db.rpc("reset_ticket_seq");
  if (error) console.warn(`! Could not reset ticket numbers (${error.message}). Did you run schema.sql?`);
  const lf = await db.rpc("reset_lost_found_seq");
  if (lf.error) console.warn(`! Could not reset Lost & Found numbers (${lf.error.message}). Did you re-run schema.sql?`);
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
  /** Why the priority differs from the guide's default (shown in the AI panel). */
  priorityReason?: string;
  hazard?: boolean;
  /** Omitted for records issues (attendance, timetable, marks). */
  building?: string;
  floor?: string;
  /** Hostel room number; common areas use `spot` instead. */
  room?: string;
  /** How many rooms the issue affects (defaults to "room" when a room is given). */
  scope?: "room" | "floor" | "building";
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
  // --- Room 204 (Aarav + roommate Kabir): the same room keeps having plumbing trouble
  //     (same room + category, 4 tickets in 30 days → recurring escalation)
  {
    key: "hot1", module: "hostel", reporter: "2616400101", ago: 26 * D,
    text: "The flush in our bathroom keeps overflowing, water is coming out into the room. Room 204.",
    title: "Overflowing flush in room 204 bathroom", summary: "The flush in the attached bathroom of New Hostel room 204 overflows and water spreads into the room. Needs a plumber to fix the cistern valve.",
    issue: "Overflowing toilet flush", category: "Plumbing", building: "New Hostel", floor: "2nd", room: "204",
    status: "Closed", assignee: "ramesh", rating: 4, feedback: "Fixed the same day, thanks!", escalated: true,
  },
  {
    key: "hot2", module: "hostel", reporter: "2616400104", ago: 18 * D,
    text: "Pipe under the wash basin in our bathroom is leaking, the bucket we kept below is full every morning. Room 204.",
    title: "Leaking pipe under basin in room 204", summary: "The pipe under the wash basin in the attached bathroom of New Hostel room 204 leaks steadily overnight. Pipe joint likely needs replacing.",
    issue: "Leaking pipe joint under wash basin", category: "Plumbing", building: "New Hostel", floor: "2nd", room: "204",
    status: "Resolved", assignee: "mahesh", escalated: true,
  },
  {
    key: "hot3", module: "hostel", reporter: "2616400101", ago: 9 * D,
    text: "Drain in our bathroom (room 204) is blocked, dirty water collects near the bathing area",
    title: "Blocked bathroom drain in room 204", summary: "The floor drain in the attached bathroom of New Hostel room 204 is blocked and dirty water is collecting near the bathing area.",
    issue: "Blocked floor drain", category: "Plumbing", building: "New Hostel", floor: "2nd", room: "204",
    status: "In Progress", assignee: "ramesh", escalated: true,
  },
  {
    // Still open: a roommate (Kabir) who reports the same tap gets the "Me too" prompt.
    key: "hot4", module: "hostel", reporter: "2616400101", ago: 2 * D, language: "hi",
    text: "रूम 204 के बाथरूम में नल से लगातार पानी टपक रहा है, पूरी रात आवाज़ आती है",
    english: "The tap in the bathroom of room 204 keeps dripping continuously; you can hear it all night.",
    title: "Tap dripping all night in room 204", summary: "A tap in the attached bathroom of New Hostel room 204 drips continuously through the night, wasting water. Needs a washer replacement.",
    issue: "Continuously dripping tap", category: "Plumbing", building: "New Hostel", floor: "2nd", room: "204",
    status: "Submitted", escalated: true,
  },
  // --- Floor-level pattern: low water pressure in 4 different rooms on New Hostel 2nd floor within a week
  //     (≥3 different rooms, same category, 7 days → floor-level escalation)
  {
    key: "wp1", module: "hostel", reporter: "2616400106", ago: 5 * D, priority: "Medium",
    text: "Water pressure in our bathroom is very low, the shower just trickles and the tap takes ages to fill a bucket. Room 212.",
    title: "Very low water pressure in room 212", summary: "Water pressure in the attached bathroom of New Hostel room 212 is very low; the shower only trickles. The student says only their room is affected.",
    issue: "Low water pressure (room 212)", category: "Water Supply", building: "New Hostel", floor: "2nd", room: "212", scope: "room",
    status: "In Progress", assignee: "ramesh", escalated: true,
  },
  {
    key: "wp2", module: "hostel", reporter: "2616400105", ago: 4 * D, priority: "Medium",
    text: "Low water pressure since Monday in room 207, the bathroom taps hardly give any water in the morning.",
    title: "Low water pressure in room 207", summary: "The taps in the attached bathroom of New Hostel room 207 give very little water, especially in the morning. Only this room reported so far.",
    issue: "Low water pressure (room 207)", category: "Water Supply", building: "New Hostel", floor: "2nd", room: "207", scope: "room",
    status: "Assigned", assignee: "ramesh", escalated: true,
  },
  {
    key: "wp3", module: "hostel", reporter: "2616400101", ago: 3 * D, priority: "Medium",
    text: "Water pressure is very low in our room 204 and our floormates say the whole 2nd floor has the same problem since last week.",
    title: "Low water pressure on whole 2nd floor", summary: "Water pressure is very low in New Hostel room 204, and the student says other rooms on the 2nd floor have the same problem since last week. Likely a floor-level supply issue.",
    issue: "Low water pressure across the floor", category: "Water Supply", building: "New Hostel", floor: "2nd", room: "204", scope: "floor",
    status: "Submitted", escalated: true,
  },
  {
    key: "wp4", module: "hostel", reporter: "2616400107", ago: 1 * D, priority: "Medium",
    text: "Room 219: no proper water in the bathroom since yesterday, pressure is almost zero. Everyone on the floor is complaining.",
    title: "Almost no water pressure in room 219", summary: "Water pressure in the attached bathroom of New Hostel room 219 is almost zero since yesterday; the student says everyone on the floor is affected.",
    issue: "Very low water pressure (floor-wide)", category: "Water Supply", building: "New Hostel", floor: "2nd", room: "219", scope: "floor",
    status: "Submitted", escalated: true, duplicateOf: "wp3", duplicateScore: 0.83,
    duplicateReason: "Both report very low water pressure affecting the whole New Hostel 2nd floor, filed a couple of days apart from different rooms.",
  },
  // --- Overdue urgent sparking socket (→ sla_breach escalation)
  {
    key: "spark", module: "hostel", reporter: "2616400103", ago: 7 * H,
    text: "Socket near my study table is sparking when I plug in my charger and there is a burning smell. Room B-305.",
    title: "Sparking socket with burning smell", summary: "The wall socket near the study table in room B-305 sparks when a charger is plugged in and gives off a burning smell. Safety hazard — needs immediate isolation.",
    issue: "Sparking wall socket, burning smell", category: "Electricity", priority: "Urgent", hazard: true,
    building: "Old Hostel", floor: "3rd", room: "B-305",
    status: "Assigned", assignee: "suresh", escalated: true,
    photo: { observed: "A scorched, blackened wall socket with melted plastic around one pin hole.", matches: true, notes: "Burn marks confirm sparking; do not use until repaired." },
  },
  // --- Other hostel tickets
  {
    key: "wifi", module: "hostel", reporter: "2616400102", ago: 3 * D,
    text: "Wifi keeps disconnecting every 10 minutes in the whole girls wing 1st floor, can't attend online classes",
    title: "Wi-Fi drops every 10 minutes", summary: "Wi-Fi disconnects roughly every 10 minutes across the entire Old Hostel Girls Wing 1st floor, affecting online classes. Likely an access-point issue.",
    issue: "Frequent Wi-Fi disconnections (whole floor)", category: "Internet", priority: "Medium",
    building: "Old Hostel", floor: "1st", room: "G-108", scope: "floor", status: "Assigned", assignee: "rohit",
  },
  {
    key: "laundry", module: "hostel", reporter: "2616400101", ago: 12 * D, machine: "NH-G-W2",
    text: "Washing machine NH-G-W2 stops in the middle of the cycle and doesn't drain the water",
    title: "Machine NH-G-W2 stops mid-cycle", summary: "Washing machine NH-G-W2 on the New Hostel ground floor stops mid-cycle and does not drain.",
    issue: "Washing machine stops mid-cycle, no drain", category: "Laundry", building: "New Hostel", floor: "Ground", spot: "Laundry machine",
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
    issue: "Overflowing garbage bin", category: "Cleanliness", building: "Old Hostel", floor: "3rd", spot: "Corridor",
    status: "Closed", assignee: "kamla", rating: 3, feedback: "Cleaned, but it took a while.",
  },
  {
    key: "geyser", module: "hostel", reporter: "2616400102", ago: 8 * D,
    text: "No hot water from the geyser in my bathroom (room G-108) since morning",
    title: "Geyser not heating water in G-108", summary: "The geyser in the attached bathroom of Old Hostel room G-108 has not been giving hot water since the morning.",
    issue: "Geyser not working", category: "Water Supply", building: "Old Hostel", floor: "1st", room: "G-108",
    status: "Resolved", assignee: "ramesh",
  },
  {
    key: "cupboard", module: "hostel", reporter: "2616400101", ago: 4 * D,
    text: "Cupboard door hinge in room 204 broke and the door fell off",
    title: "Cupboard door fell off", summary: "The cupboard door hinge in New Hostel room 204 is broken and the door has come off.",
    issue: "Broken cupboard hinge", category: "Room Repair", building: "New Hostel", floor: "2nd", room: "204",
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
    text: "Two tube lights flickering in the ground floor corridor of the girls wing",
    title: "Flickering tube lights in corridor", summary: "Two tube lights in the Old Hostel Girls Wing ground floor corridor are flickering.",
    issue: "Flickering tube lights", category: "Electricity", building: "Old Hostel", floor: "Ground", spot: "Corridor",
    status: "Closed", assignee: "dinesh", rating: 5,
  },
  {
    key: "lan", module: "hostel", reporter: "2616400103", ago: 6 * D,
    text: "LAN port in my room B-305 is dead, only me, others on floor are fine",
    title: "LAN port not working in B-305", summary: "The LAN port in Old Hostel room B-305 has no connection; only this room is affected.",
    issue: "Dead LAN port (single room)", category: "Internet", building: "Old Hostel", floor: "3rd", room: "B-305",
    status: "Resolved", assignee: "rohit",
  },
  {
    key: "cooler", module: "hostel", reporter: "2616400101", ago: 11 * D,
    text: "RO water cooler on ground floor is giving warm water and leaking from the bottom",
    title: "Water cooler warm and leaking", summary: "The RO water cooler on the New Hostel ground floor dispenses warm water and leaks from the bottom. It was reported fixed once but the problem came back.",
    issue: "Water cooler not cooling, leaking", category: "Water Supply", priority: "Medium", building: "New Hostel", floor: "Ground", spot: "Water cooler / RO",
    status: "Reopened", assignee: "ramesh", reopenCount: 1,
  },
  {
    key: "dogs", module: "hostel", reporter: "2616400102", ago: 2 * D,
    text: "Stray dogs are entering the girls wing corridor at night, we are scared to go to the washroom",
    title: "Stray dogs in girls wing at night", summary: "Stray dogs are getting into the Old Hostel Girls Wing corridor at night, making students afraid to walk to the washroom.",
    issue: "Stray dogs entering hostel corridor", category: "Other", priority: "Medium",
    building: "Old Hostel", floor: "Ground", spot: "Corridor", status: "Submitted",
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
    issue: "Washing machine not working (ID unknown)", category: "Laundry", building: "Old Hostel", floor: "Basement", spot: "Laundry machine",
    status: "Submitted", detailsIncomplete: true,
  },
  // --- Academic tickets
  // Hotspot: 3 projector tickets on Block B 2nd floor in 30 days (→ recurring escalation to HOD)
  {
    key: "proj1", module: "academic", reporter: "2616400102", ago: 21 * D,
    text: "Projector in B-201 keeps switching off every 10 minutes during lectures",
    title: "Projector in B-201 keeps switching off", summary: "The projector in classroom B-201 (Block B, 2nd floor) turns itself off roughly every 10 minutes, interrupting lectures. Likely overheating or a lamp fault.",
    issue: "Projector shutting down repeatedly", category: "Classroom Facilities", department: "Electrical Maintenance",
    building: "Block B", floor: "2nd", spot: "Classroom B-201", status: "Closed", assignee: "suresh", rating: 3, feedback: "Worked for a week, then the same problem.", escalated: true,
  },
  {
    key: "proj2", module: "academic", reporter: "2616400103", ago: 11 * D,
    text: "B-205 projector image is very dim and yellow, nobody at the back can read the slides",
    title: "Dim, yellow projector image in B-205", summary: "The projector in classroom B-205 (Block B, 2nd floor) shows a very dim, yellowish image that can't be read from the back rows. The lamp probably needs replacing.",
    issue: "Dim projector (lamp failing)", category: "Classroom Facilities", department: "Electrical Maintenance",
    building: "Block B", floor: "2nd", spot: "Classroom B-205", status: "Resolved", assignee: "dinesh", escalated: true,
  },
  {
    key: "projector", module: "academic", reporter: "2616400101", ago: 2 * D,
    text: "Projector in B-204 shows 'no signal' from the HDMI cable, teacher couldn't show slides",
    title: "Projector shows no signal in B-204", summary: "The projector in classroom B-204 shows 'No signal' over HDMI, so lectures can't use slides.",
    issue: "Projector HDMI no signal", category: "Classroom Facilities", department: "Electrical Maintenance",
    building: "Block B", floor: "2nd", spot: "Classroom B-204", status: "Assigned", assignee: "dinesh", escalated: true,
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
    text: "My attendance for Basic Electrical (Section B, Sem 1) shows 40% on the portal but I attended all classes",
    title: "Wrong attendance in Basic Electrical", summary: "The attendance portal shows 40% for Basic Electrical (Section B, Semester 1) although the student says they attended all classes. Records need checking.",
    issue: "Attendance record error", category: "Academic Admin",
    status: "Submitted",
  },
  {
    key: "clash", module: "academic", reporter: "2616400103", ago: 1 * D,
    text: "Mathematics tutorial and Programming lab are clashing on Thursday 2pm for section B",
    title: "Timetable clash on Thursday 2pm", summary: "For section B, the Mathematics tutorial and the Programming lab are both scheduled on Thursday at 2 pm.",
    issue: "Timetable clash", category: "Academic Admin",
    status: "In Progress", assignee: "kapoor",
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
  // --- Reported by faculty (CLAUDE.md §14): Prof. Khan, class about to start -> High
  {
    key: "facproj", module: "academic", reporter: "khan", ago: 3 * H,
    text: "Projector in C-204 is not turning on at all, I have my Programming lecture there at 2 pm and 70 students are coming.",
    title: "Projector not turning on in C-204", summary: "The projector in classroom C-204 (Block C, 2nd floor) does not switch on. The faculty member has a Programming lecture there at 2 pm, so a scheduled class is affected.",
    issue: "Projector not powering on before a scheduled lecture", category: "Classroom Facilities", department: "Electrical Maintenance",
    priority: "High", priorityReason: "Disrupts a scheduled class",
    building: "Block C", floor: "2nd", spot: "Classroom C-204", status: "In Progress", assignee: "suresh",
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

    // SLA: open tickets that would already be overdue get a fresh, healthy window (≈40% used), so the SLA
    // watcher doesn't fire a burst of alerts on first load. Only the sparking socket stays overdue; it is
    // seeded as already flagged (and escalated), so the watcher leaves it alone.
    const naturalDue = computeSlaDueAt(t.module, t.category, priority, created);
    const isOpen = ["Submitted", "Assigned", "In Progress", "Reopened"].includes(t.status);
    const windowMs = naturalDue.getTime() - created.getTime();
    const refreshed = isOpen && t.key !== "spark" && naturalDue.getTime() < now;
    const slaDue = refreshed ? new Date(now + windowMs * 0.6) : naturalDue;

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
              : t.priorityReason ?? `Raised to ${priority} because it affects many students or hygiene/safety.`,
        },
      },
      photo_analysis: t.photo
        ? { observed: t.photo.observed, matches_complaint: t.photo.matches, notes: t.photo.notes }
        : null,
      building: t.building ?? null,
      floor: t.floor ?? null,
      room_no: t.room ?? null,
      scope: t.scope ?? (t.room ? "room" : null),
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
      sla_due_at: slaDue.toISOString(),
      sla_started_at: refreshed ? new Date(slaDue.getTime() - windowMs).toISOString() : null,
      ...(t.key === "spark" ? { sla_reminded_at: new Date(now).toISOString(), sla_breach_count: 1 } : {}),
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

    ev("created", reporter, created.toISOString(), null, "Submitted", `Reported via ${MODULE_LABELS[t.module]}${reporter.role === "teacher" ? " by faculty" : ""}${t.confidential ? " (confidential)" : ""}`);
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
        t.key === "spark"
          ? at(0.6)
          : t.module === "security"
            ? at(0.001)
            : new Date(Math.max(now - 2 * D, created.getTime() + 30 * 60_000)).toISOString(),
        null,
        null,
        t.module === "security"
          ? "Escalated to the Dean of Student Affairs immediately because this is a safety report."
          : t.module === "academic"
            ? "Escalated to Head of Department for priority attention."
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

  // The ticket_events trigger just "notified" students about seeded history — start with an empty bell.
  must(await db.from("notifications").delete().not("id", "is", null), "clear seed notifications");

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
        hotspot_key: "hostel|Plumbing|New Hostel|2nd|204",
        reason: "recurring",
        target_role: "dean",
        // unique reporters + followers across the room's tickets (Aarav and his roommate Kabir)
        affected_count: 2,
        brief_count: 2,
        brief_model: "seed",
        headline: "Room 204 keeps having plumbing faults",
        brief:
          "Four plumbing complaints in 26 days from New Hostel room 204: an overflowing flush, a leaking basin pipe, a blocked bathroom drain and a tap dripping all night.\nTwo roommates have reported them; one ticket is still open and one is in progress.\nEstate / Maintenance fixes each fault separately, but a new one appears every week.",
        recommended_action:
          "Order a full plumbing check of room 204's attached bathroom (cistern, basin pipe, drain, tap washers) this week instead of one-off repairs.",
        urgency_reason: "Repeated faults in the same room point to ageing fittings that one-off repairs are not fixing.",
        created_at: new Date(Date.now() - 2 * D).toISOString(),
      },
      {
        module: "hostel",
        hotspot_key: "hostel|Water Supply|New Hostel|2nd|*",
        reason: "recurring",
        target_role: "dean",
        // Aarav (204), Vikram (207), Ishaan (212) and Dev (219)
        affected_count: 4,
        brief_count: 4,
        brief_model: "seed",
        headline: "Low water pressure across New Hostel 2nd floor",
        brief:
          "Four different rooms on New Hostel 2nd floor (204, 207, 212 and 219) reported very low water pressure within five days; two of them say the whole floor is affected.\nEach room has its own attached bathroom, so independent faults are unlikely: the cause is probably shared.\nOne ticket is in progress, one is assigned and two are still unassigned.",
        recommended_action:
          "Have Estate / Maintenance inspect the 2nd floor water pipeline and main valve (and the overhead tank outlet) today, instead of treating each room separately.",
        urgency_reason: "A whole floor has almost no water pressure, which affects hygiene and daily routines for every student on it.",
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
        module: "academic",
        hotspot_key: "academic|Classroom Facilities|Block B|2nd",
        reason: "recurring",
        target_role: "hod",
        // Priya, Rahul and Aarav each reported one projector
        affected_count: 3,
        brief_count: 3,
        brief_model: "seed",
        headline: "Block B 2nd floor projectors keep failing",
        brief:
          "Three projector complaints in 21 days from Block B 2nd floor classrooms: B-201 switching off every 10 minutes, a dim yellow image in B-205, and 'no signal' over HDMI in B-204.\nElectrical Maintenance fixed B-201, but the student says the fault came back after a week; B-205 is resolved and B-204 is still assigned.\nThree students reported them, and lectures on this floor regularly lose slides.",
        recommended_action:
          "Ask Electrical Maintenance to audit all Block B 2nd floor projectors (lamps, ventilation, HDMI cables) this week and budget replacement lamps instead of one-off repairs.",
        urgency_reason: "Repeated projector failures disrupt lectures for every section that uses these rooms.",
        created_at: new Date(Date.now() - 2 * D).toISOString(),
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
  console.log("✔ 5 escalations (room-level + floor-level hostel hotspots, academic hotspot, SLA breach, safety report)");
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
  answers: {
    author: string;
    body: string;
    best?: boolean;
    voters?: string[];
    comments?: { author: string; body: string }[];
  }[];
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
      { author: "2616400103", body: "I think of it as: `==` → same content, `is` → same memory address (id).", voters: ["2616400101"] },
    ],
  },
  {
    author: "2616400103", subject: "Physics", ago: 4 * D, voters: ["2616400101"],
    title: "Why does a charged particle move in a circle in a magnetic field?",
    body: "If the magnetic force acts on it, why doesn't the speed change?",
    answers: [
      {
        author: "das", best: true, voters: ["2616400101", "2616400102"],
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
  // Hindi question, still waiting for a teacher
  {
    author: "2616400103", subject: "Physics", ago: 20 * H, voters: ["2616400101", "2616400102"],
    title: "न्यूटन का तीसरा नियम: अगर हर क्रिया की बराबर प्रतिक्रिया होती है तो चीज़ें हिलती कैसे हैं?",
    body: "अगर घोड़ा गाड़ी को खींचता है और गाड़ी भी घोड़े को उतने ही बल से पीछे खींचती है, तो दोनों बल कैंसल क्यों नहीं हो जाते? कृपया आसान भाषा में समझाइए।",
    answers: [
      { author: "2616400101", body: "मुझे लगता है दोनों बल अलग-अलग चीज़ों पर लगते हैं, इसलिए कैंसल नहीं होते — पर पक्का नहीं पता।", voters: ["2616400102"] },
    ],
  },
];

async function seedQuestions() {
  let answerCount = 0;
  for (const q of QUESTIONS) {
    const created = Date.now() - q.ago;
    const answerAt = (i: number) => new Date(created + (i + 1) * 3 * H).toISOString();
    // "answered" = a teacher has answered or a best answer is marked (same rule as the app).
    const firstTeacher = q.answers.findIndex((a) => u(a.author).role === "teacher");
    const question = must(
      await db
        .from("questions")
        .insert({
          author_id: u(q.author).id,
          subject: q.subject,
          title: q.title,
          body: q.body,
          status: firstTeacher >= 0 || q.answers.some((a) => a.best) ? "answered" : "open",
          answered_at: firstTeacher >= 0 ? answerAt(firstTeacher) : null,
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
            created_at: answerAt(i),
          })
          .select("id")
          .single(),
        "answer",
      ) as { id: string };
      answerCount++;
      if (a.voters?.length) {
        must(
          await db.from("answer_votes").insert(a.voters.map((v) => ({ answer_id: answer.id, user_id: u(v).id }))),
          "answer votes",
        );
      }
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
// 5. Lost & Found: 4 found + 2 lost items; one lost report matches the earbuds
// ---------------------------------------------------------------------------
interface LfSeed {
  key: string;
  type: "lost" | "found";
  /** Roll number (login id) of the reporter. */
  by: string;
  title: string;
  description: string;
  publicDescription: string;
  category: string;
  color?: string;
  brand?: string;
  marks?: string;
  sensitive?: boolean;
  building: string;
  spot: string;
  daysAgo: number;
  heldAt?: "security_office" | "with_finder";
  question?: string;
  answer?: string;
}

const LOST_FOUND: LfSeed[] = [
  {
    key: "earbuds", type: "found", by: "2616400102", title: "Black JBL earbuds with case",
    description: "Found a black earbuds case with a pair of JBL earbuds on the reading table near the window in the library.",
    publicDescription: "Black wireless earbuds in a black charging case, JBL logo on the case.",
    category: "Earphones", color: "black", brand: "JBL", marks: "scuffed corner on the case",
    building: "Block B", spot: "Library", daysAgo: 1, heldAt: "security_office",
    question: "What is stuck on the inside of the case lid?", answer: "A small white star sticker",
  },
  {
    key: "bottle", type: "found", by: "2616400101", title: "Blue steel water bottle",
    description: "Blue steel water bottle with a Linux penguin sticker, left on the bench near court 2.",
    publicDescription: "Blue steel water bottle with a sticker on the side.",
    category: "Bottle", color: "blue", marks: "penguin sticker, dent near the base",
    building: "Sports Complex", spot: "Court 2 bench", daysAgo: 3, heldAt: "with_finder",
    question: "What is written on the bottom of the bottle?", answer: "Initials A.K. in marker",
  },
  {
    key: "idcard", type: "found", by: "2616400101", title: "College ID card",
    description: "Found a college ID card on a table in the New Hostel mess. Name and roll number are printed on it.",
    publicDescription: "A college ID card in a blue lanyard sleeve.",
    category: "ID card", color: "blue", sensitive: true,
    building: "New Hostel Mess", spot: "Dining hall", daysAgo: 2, heldAt: "security_office",
    question: "What year of admission is printed on the card?", answer: "2025",
  },
  {
    key: "umbrella", type: "found", by: "2616400103", title: "Black folding umbrella",
    description: "Black folding umbrella left in the Block A ground floor lobby. Has a wooden handle.",
    publicDescription: "Black folding umbrella with a wooden handle.",
    category: "Umbrella", color: "black", marks: "wooden handle",
    building: "Block A", spot: "Ground floor lobby", daysAgo: 27, heldAt: "security_office",
    question: "What colour is the strap or cover?", answer: "Dark green cover",
  },
  {
    key: "lost-earbuds", type: "lost", by: "2616400103", title: "Black earbuds with case",
    description: "I lost my black wireless earbuds in their charging case. I think I left them on a table in the library on the first floor.",
    publicDescription: "Black wireless earbuds in a black charging case.",
    category: "Earphones", color: "black",
    building: "Block B", spot: "Library", daysAgo: 1,
  },
  {
    key: "lost-book", type: "lost", by: "2616400102", title: "Engineering Physics textbook",
    description: "Lost my Engineering Physics textbook (blue cover) with my notes inside, probably after the lecture in Block C.",
    publicDescription: "Blue-covered Engineering Physics textbook with handwritten notes.",
    category: "Book", color: "blue",
    building: "Block C", spot: "Room C-204", daysAgo: 4,
  },
];

async function seedLostFound() {
  const ids = new Map<string, string>();
  const nos = new Map<string, string>();
  for (const it of LOST_FOUND) {
    const at = new Date(Date.now() - it.daysAgo * D).toISOString();
    const row = must(
      await db
        .from("lost_found_items")
        .insert({
          type: it.type,
          reporter_id: u(it.by).id,
          title: it.title,
          description: it.description,
          public_description: it.publicDescription,
          item_category: it.category,
          color: it.color ?? null,
          brand: it.brand ?? null,
          marks: it.marks ?? null,
          sensitive: it.sensitive ?? false,
          building: it.building,
          spot: it.spot,
          happened_at: at,
          created_at: at,
          held_at: it.type === "found" ? (it.heldAt ?? "security_office") : null,
          verification_question: it.question ?? null,
          verification_answer: it.answer ?? null,
          ai_meta: { model: "seed", moderation: "passed" },
        })
        .select("id, item_no")
        .single(),
      `lost & found ${it.key}`,
    )!;
    ids.set(it.key, row.id);
    nos.set(it.key, row.item_no);
    must(
      await db.from("lost_found_log").insert({
        item_id: row.id,
        actor_id: u(it.by).id,
        actor_name: u(it.by).name,
        actor_roll_no: it.by,
        action: `${it.type}_reported`,
        detail: `${row.item_no} · ${it.category}`,
        created_at: at,
      }),
      "lost & found log",
    );
  }

  // The AI's suggested match: Rahul's lost earbuds <-> the found JBL earbuds.
  const reason = "Both are black wireless earbuds with a charging case, lost and found in the Block B library within a day of each other.";
  must(
    await db.from("lost_found_matches").insert({ lost_id: ids.get("lost-earbuds")!, found_id: ids.get("earbuds")!, score: 0.86, reason, status: "suggested" }),
    "lost & found match",
  );
  must(
    await db.from("lost_found_log").insert({
      item_id: ids.get("earbuds")!,
      actor_name: "CampusConnect AI",
      action: "match_suggested",
      detail: `${nos.get("lost-earbuds")}↔${nos.get("earbuds")} (86%)`,
    }),
    "lost & found log",
  );
  must(
    await db.from("notifications").insert([
      { user_id: u("2616400103").id, kind: "lost_found", title: "A possible match was found", body: `Someone found "Black JBL earbuds with case" — it could be your lost earbuds.`, link: `/lost-found/${ids.get("earbuds")}` },
      { user_id: u("2616400102").id, kind: "lost_found", title: "A possible match was found", body: `Someone reported losing "Black earbuds with case", which could be the earbuds you found.`, link: `/lost-found/${ids.get("lost-earbuds")}` },
    ]),
    "lost & found notifications",
  );
  const found = LOST_FOUND.filter((i) => i.type === "found").length;
  console.log(`✔ ${LOST_FOUND.length} Lost & Found items (${found} found, ${LOST_FOUND.length - found} lost), 1 suggested match`);
}

// ---------------------------------------------------------------------------
// 6. Ask my teacher: one doubt waiting 3 days (triggers the 48h reminder), one answered
// ---------------------------------------------------------------------------
async function seedDoubts() {
  const mk = async (opts: {
    student: string;
    subject: string;
    title: string;
    status: "open" | "answered";
    hoursAgo: number;
    messages: { sender: "student" | "teacher"; by: string; body: string; hoursAgo: number }[];
  }) => {
    const created = new Date(Date.now() - opts.hoursAgo * H).toISOString();
    const last = opts.messages[opts.messages.length - 1];
    const thread = must(
      await db
        .from("doubt_threads")
        .insert({
          student_id: u(opts.student).id,
          subject: opts.subject,
          title: opts.title,
          status: opts.status,
          last_sender: last.sender,
          last_message_at: new Date(Date.now() - last.hoursAgo * H).toISOString(),
          answered_at: opts.status === "answered" ? new Date(Date.now() - last.hoursAgo * H).toISOString() : null,
          created_at: created,
        })
        .select("id")
        .single(),
      "doubt thread",
    )!;
    must(
      await db.from("doubt_messages").insert(
        opts.messages.map((m) => ({
          thread_id: thread.id,
          author_id: u(m.by).id,
          sender: m.sender,
          body: m.body,
          created_at: new Date(Date.now() - m.hoursAgo * H).toISOString(),
        })),
      ),
      "doubt messages",
    );
  };

  await mk({
    student: "2616400101",
    subject: "Mathematics",
    title: "Why do we get two different answers when integrating by parts in a different order?",
    status: "open",
    hoursAgo: 72,
    messages: [
      {
        sender: "student",
        by: "2616400101",
        hoursAgo: 72,
        body: "I integrated x*e^x two ways (choosing u = x, then u = e^x) and the second one gave a messier answer. Is one of them wrong, or is it just harder?",
      },
    ],
  });
  await mk({
    student: "2616400102",
    subject: "Physics",
    title: "What is the difference between speed and velocity in circular motion?",
    status: "answered",
    hoursAgo: 30,
    messages: [
      { sender: "student", by: "2616400102", hoursAgo: 30, body: "A car goes around a circular track at a constant 60 km/h. My book says its velocity is changing. How, if the speedometer never changes?" },
      {
        sender: "teacher",
        by: "khan",
        hoursAgo: 26,
        body: "Speed is only a number (how fast). Velocity also has a direction. On a circle the direction keeps changing, so the velocity keeps changing even when the speed is constant. That change of velocity is why there is an acceleration towards the centre.",
      },
    ],
  });
  console.log("✔ 2 private doubts (1 waiting 3 days, 1 answered)");
}

// ---------------------------------------------------------------------------
// 7. Anonymous teacher feedback (8 for Prof. Das / Mathematics) + one anonymous concern
// ---------------------------------------------------------------------------
async function seedFeedback() {
  const term = currentTerm();
  const das = u("das").id;
  // clarity, doubt_solving, punctuality, fairness, respect + optional comment (+ neutral one-liner for the HOD)
  const rows: [string, [number, number, number, number, number], string | null, string | null][] = [
    ["2616400102", [5, 5, 4, 5, 5], "Explains every step on the board and always stays back to clear doubts.", "Praises the clear step-by-step explanations and willingness to stay back for doubts."],
    ["2616400103", [4, 4, 5, 4, 5], "Very punctual and respectful. Sometimes goes a bit fast in the last ten minutes.", "Punctual and respectful; the pace speeds up near the end of class."],
    ["2616400104", [5, 4, 4, 5, 4], null, null],
    ["2616400105", [3, 3, 4, 4, 4], "Explains too fast when a topic is hard, and it is difficult to ask in a full class.", "Finds the pace too fast on difficult topics and finds it hard to ask questions in class."],
    ["2616400106", [4, 5, 5, 5, 5], "Solved my doubt in the corridor in five minutes. Very approachable.", "Approachable and quick to resolve doubts outside class."],
    ["2616400107", [4, 3, 4, 4, 4], "More solved examples before the test would help.", "Would like more solved examples before tests."],
    ["2616400108", [5, 5, 5, 5, 5], null, null],
    ["2616400109", [3, 4, 3, 4, 4], "Sometimes the class starts late, but the notes he shares are really good.", "Classes sometimes start late, though the shared notes are valued."],
  ];
  must(
    await db.from("teacher_feedback").insert(
      rows.map(([login, s, comment, neutral], i) => ({
        student_id: u(login).id,
        teacher_id: das,
        subject: "Mathematics",
        term,
        clarity: s[0],
        doubt_solving: s[1],
        punctuality: s[2],
        fairness: s[3],
        respect: s[4],
        comment,
        neutral_summary: neutral,
        moderation: "passed",
        created_at: new Date(Date.now() - (2 + i) * D).toISOString(),
      })),
    ),
    "teacher feedback",
  );
  // A cached AI summary so the demo works without Gemini; it is regenerated as soon as a 9th response arrives.
  must(
    await db.from("feedback_summaries").insert({
      teacher_id: das,
      subject: "Mathematics",
      term,
      response_count: rows.length,
      model: "seed",
      summary: {
        overview: "Students rate the teaching very highly overall, especially the clarity of explanations and how approachable the teacher is outside class.",
        strengths: ["Clear, step-by-step explanations", "Approachable and quick to resolve doubts", "Respectful and fair with students", "Helpful shared notes"],
        concerns: ["The pace can feel fast on harder topics", "Classes occasionally start late"],
        suggestions: ["Slow down on difficult topics and pause for questions", "Share more solved examples before tests"],
      },
    }),
    "feedback summary",
  );

  // One anonymous concern (Rahul -> Prof. Khan, irregular classes), 1 day old and not yet acknowledged.
  const khan = u("khan").id;
  const rahul = u("2616400103").id;
  const createdAt = new Date(Date.now() - 1 * D).toISOString();
  const summary = "A student reports that several recent Physics lectures were skipped without notice, leaving the syllabus behind.";
  const ticket = must(
    await db
      .from("tickets")
      .insert({
        module: "academic",
        reporter_id: rahul,
        original_text:
          "Prof. Khan has skipped four of the last six Physics lectures without telling us beforehand. We wait in the classroom for twenty minutes and then leave. The syllabus is falling behind before the internal test.",
        language: "en",
        title: "Concern: Absence / irregular classes (Physics)",
        summary,
        category: "Teacher Concern",
        department: "Head of Department",
        priority: "Medium",
        ai_meta: { model: "seed", moderation: "passed", manual_entry: true },
        is_confidential: true,
        hide_identity: true,
        teacher_complaint: true,
        status: "Submitted",
        sla_due_at: null,
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select("id, ticket_no")
      .single(),
    "concern ticket",
  )!;
  const concern = must(
    await db
      .from("teacher_concerns")
      .insert({
        ticket_id: ticket.id,
        teacher_id: khan,
        subject: "Physics",
        term,
        concern_category: "Absence / irregular classes",
        happened_when: "Four of the last six Physics lectures, since mid-September",
        neutral_summary: summary,
        moderation: "passed",
        created_at: createdAt,
      })
      .select("id")
      .single(),
    "teacher concern",
  )!;
  must(await db.from("teacher_concern_identity").insert({ concern_id: concern.id, reporter_id: rahul, teacher_id: khan, term }), "concern identity");
  must(
    await db.from("ticket_events").insert({
      ticket_id: ticket.id,
      actor_id: null,
      actor_name: "CampusConnect",
      actor_role: null,
      type: "created",
      to_status: "Submitted",
      note: "Your concern was received. It is anonymous: the teacher will never see it, and your name is not shown to anyone.",
      created_at: createdAt,
    }),
    "concern event",
  );
  console.log(`✔ ${rows.length} anonymous feedback entries for Prof. Das (Mathematics) + 1 anonymous concern (${ticket.ticket_no})`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log("Seeding CampusConnect…");
  await seedAccounts();
  await wipe();
  const ids = await seedTickets();
  await seedEscalations(ids);
  await seedQuestions();
  await seedLostFound();
  await seedDoubts();
  await seedFeedback();
  console.log("Done ✔  Log in with any demo account (password demo1234).");
}

main().catch((err) => {
  console.error("✖ Seed failed:", err instanceof Error ? err.message : err);
  console.error("  Did you run supabase/schema.sql and fill in .env.local?");
  process.exit(1);
});
