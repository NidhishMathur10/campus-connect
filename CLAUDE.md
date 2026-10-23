# CampusConnect — Project Spec (read this before every task)

Hackathon project (Google-organised). Deadline: 7:00 AM. Build in phases; finish and test each phase before the next.
Team does not know React/Next.js — explain any manual step (dashboard clicks, env vars) in plain, numbered instructions.

## 1. What we are building
An AI-powered campus platform that turns informal student complaints into clear, trackable tickets, plus an Education module with academic tickets and an open Q&A board.

Problem statement minimum requirements (MUST all work — judges check these):
1. Accept a written complaint, location, and optional photograph.
2. Extract the issue, summarise it, and request missing information.
3. Suggest a category and responsible department using a supplied routing guide.
4. Flag potentially duplicate reports for staff review.
5. Staff dashboard to assign tickets and update status.
6. Students see a ticket number and progress history.
Gemini must interpret complaints, analyse photos, and generate structured ticket details.
Optional extensions (we do both): Hindi complaint entry, recurring-issue analysis.

## 2. Tech stack
- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + lucide-react icons + recharts (charts)
- Supabase: Postgres, Auth, Storage (bucket `complaint-photos`), Realtime
- Gemini via `@google/genai` SDK, called ONLY from server code (route handlers / server actions). Model name from env `GEMINI_MODEL` (default: latest Gemini Flash model). Always use structured JSON output with a response schema; validate with zod.
- Deploy: Vercel
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `NEXT_PUBLIC_COLLEGE_NAME`; email (§15): `COLLEGE_EMAIL_DOMAIN`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `DEMO_NOTIFY_EMAIL`
- Never expose service role key or Gemini key to the browser.

## 3. Config (keep in `src/config/*.ts`, single source of truth)
College name: from `NEXT_PUBLIC_COLLEGE_NAME` (placeholder "Your College").

### Locations
Buildings: Old Hostel (Boys Wing / Girls Wing — mixed hostel), New Hostel (Boys only), Block A (contains Library), Block B, Block C, Block D, Girls Mess, Old Hostel Mess (Boys), New Hostel Mess (Boys), Gym (inside Old Hostel), Sports Complex (multiple courts; sports material issued here).
Floors: Basement, Ground, 1st, 2nd, 3rd, 4th, 5th.
**Hostel layout (Old Hostel and New Hostel):** 4 students per room; every room has its own attached washrooms, bathrooms and balconies. There are NO common washrooms, and we do NOT track which washroom/bathroom — the room number is enough (students add detail in the complaint text; the AI never asks "which washroom").
**Hostel location = building → floor → EITHER (a) a room number (`tickets.room_no`, e.g. `204`) OR (b) a common area stored in `tickets.spot`:** Corridor, Staircase, Water cooler / RO, Laundry machine (+ machine ID), Gym, Mess, Other (free text, saved as `Other: <text>`). The report form pre-fills the student's own hostel, floor and room from their profile, with an "It's somewhere else" option. Messes, Gym and Sports Complex (separate buildings) keep a free-text spot; academic blocks keep block + floor + room/lab (see Education module).
**Scope (`tickets.scope`: `room` | `floor` | `building`):** how many rooms an issue affects. The AI asks "Only your room, or other rooms on this floor too?" for Water Supply (no water / low pressure), Electricity (power cut) and Internet (Wi-Fi outage / slow Wi-Fi); a ticket with a room defaults to `room` otherwise.
Spot (non-hostel buildings and academic): free text (classroom, lab, court, etc.).
Washing machines (selectable IDs): New Hostel Ground NH-G-W1..W4; New Hostel 3rd floor NH-3-W1..W4; Old Hostel Ground OH-G-W1..W3; Old Hostel Basement OH-B-W1..W3.

### Routing guide — Hostel & Campus module
| Category | Typical issues | Department | Default priority | SLA |
|---|---|---|---|---|
| Plumbing | leaks, taps, flush, drainage | Estate / Maintenance | Medium | 24h |
| Water Supply | no water, low pressure, geyser, water cooler/RO | Estate / Maintenance | High | 4h |
| Electricity | lights, fans, sockets, switches, power cut, AC | Electrical Maintenance | Medium | 24h |
| Cleanliness | washrooms, garbage, corridors, pests | Housekeeping | Medium | 24h |
| Internet | Wi-Fi down/slow, login, LAN port | IT Cell | Medium | 24h |
| Laundry | washing machines | Estate / Maintenance | Low | 72h |
| Room Repair | door, bed, cupboard, window, lock | Estate / Maintenance | Medium | 24h |
| Gym | gym equipment/facility | Estate / Maintenance | Low | 72h |
| Sports | courts, sports material | Estate / Maintenance | Low | 72h |
| Mess Food | quality, quantity, hygiene of food | Mess Committee | Medium | 24h |
| Other | unclear / doesn't fit | Warden (manual triage) | Low | 72h |

### Routing guide — Education module (academic issues)
| Category | Examples | Department | Default priority | SLA |
|---|---|---|---|---|
| Classroom Facilities | projector, smart board, AC, benches, mic in Blocks A–D | Electrical Maintenance (electrical) / Estate (furniture) | Medium | 24h |
| Lab Equipment | computers, software missing | Lab In-charge | Medium | 24h |
| Academic Admin | timetable clash, attendance error, exam/marks issue | Academic Office | Medium | 48h |
| Library | book unavailable, seating, library facilities | Library Staff | Low | 72h |
| Other | — | Academic Office | Low | 72h |

Priority rules: Urgent (SLA 2h) overrides any category for safety hazards — sparking, exposed wires, flooding near electricals, gas smell, fire risk, injury risk.

### Q&A subjects
General Studies, Mathematics, Programming, Physics, Basic Electrical, Introduction to AI, Communication Skills, Environmental Studies, Other.

## 4. Roles & access
- student — self sign-up (full name, roll number, module-independent: hostel, wing, room, password). Roll number is the username; internally email = `<rollno>@campusconnect.app`. Sees only own tickets (plus tickets they joined via "Me too").
- staff — belongs to one department; sees and manages tickets of that department.
- warden — admin of Hostel module; sees all hostel tickets (never security tickets); can escalate to Dean.
- security_officer / arc — Safety & Security module staff (see §12).
- dean — Dean of Student Affairs; sees Hostel escalations + everything read-only.
- hod — Head of Department; sees Academic escalations + academic tickets read-only.
- teacher — answers Q&A; sees author roll numbers; also a faculty reporter (§14).
- academic_office — staff for academic tickets; also a faculty reporter (§14).
Staff/admin accounts are seeded only (no staff sign-up).
Q&A: students see other authors' NAME only; teachers/staff/admins also see ROLL NUMBER.

Seeded demo accounts (password `demo1234` for all), shown as one-click quick-login buttons on the login page:
- Students: Aarav Mehta (2616400101, New Hostel, room 204), Priya Singh (2616400102, Old Hostel Girls Wing, room G-108), Rahul Verma (2616400103, Old Hostel Boys Wing, room B-305), Kabir Khanna (2616400104, New Hostel, room 204 — Aarav's roommate, for the "Me too" demo). Three more seeded New Hostel 2nd-floor students (Vikram 207, Ishaan 212, Dev 219; `hidden: true` in `demo-accounts.ts`, no quick-login button) exist only to make the floor-level seed pattern realistic.
- Staff: Ramesh, Mahesh (Estate / Maintenance); Suresh, Dinesh (Electrical Maintenance); Kamla, Sunita (Housekeeping); Rohit, Ankit (IT Cell); Mr. Sharma (Mess Committee); Mr. Gupta (Lab In-charge); Ms. Nair (Library Staff); Mrs. Kapoor (Academic Office)
- Warden: Mr. Rao · Dean: Dr. Iyer (Dean of Student Affairs) · HOD: Dr. Banerjee · Teachers: Prof. Das, Prof. Khan

## 5. Data model (Supabase)
- profiles: id (= auth.users.id), full_name, roll_no (unique, nullable for non-students), role, department (nullable), hostel, wing, room, created_at
- tickets: id, ticket_no (text, `CC-1001`, from a sequence), tracking_pin (legacy, unused), module ('hostel' | 'academic' | 'security'), is_confidential, hide_identity, reporter_id, original_text, language ('en'|'hi'|other), english_text, title, summary, category, department, priority, ai_meta jsonb (confidence + reason per field, extracted issue, model), photo_url, photo_analysis jsonb (observed, matches_complaint, notes), building, floor, room_no (hostel room number), spot (common area / free-text spot), machine_id, scope ('room'|'floor'|'building', hostel only), status, details_incomplete bool, assigned_to (profile id), duplicate_of (ticket id), duplicate_score, duplicate_reason, duplicate_status ('none'|'flagged'|'merged'|'dismissed'), escalated bool, reopen_count int, rating int, feedback text, sla_due_at, resolved_at, created_at, updated_at
- ticket_events: id, ticket_id, actor_id, actor_name, actor_role, type ('created'|'status_change'|'assigned'|'note'|'duplicate_flagged'|'merged'|'duplicate_dismissed'|'override'|'escalated'|'reopened'|'rating'|'me_too'), from_status, to_status, note, created_at — this is the student-visible progress history (internal-only types may be hidden from students).
- ticket_followers: ticket_id, user_id (for "Me too")
- escalations: id, module, ticket_id (nullable), hotspot_key (nullable, e.g. `hostel|Plumbing|New Hostel|2nd`), reason ('recurring'|'reopened'|'sla_breach'|'manual'|'safety'), target_role ('dean'|'hod'), brief, recommended_action, affected_count, status ('open'|'acknowledged'|'resolved'), directive, created_at
- questions: id, author_id, subject, title, body, status ('open'|'answered'), best_answer_id, upvotes int, created_at
- answers: id, question_id, author_id, body, created_at
- question_votes: question_id, user_id (unique pair)
Statuses for tickets: Submitted → Assigned → In Progress → Resolved → Closed (student confirms fix). Reopened goes back to staff. Merged duplicates become 'Merged' and link to the original.
Enable RLS with sensible policies matching section 4. Enable Realtime on tickets and ticket_events.

## 6. AI pipeline (server-side, in `src/lib/ai/`)
1. analyzeComplaint(text, location, photo?, module, previousAnswers?) → JSON: language, english_text, title (≤8 words), summary (2–3 lines, English), extracted_issue, category, department, priority (+ is_safety_hazard), confidence per field (0–1), reason per field, photo_analysis {observed, matches_complaint, notes}, missing_fields[], follow_up_questions[] (max 3, in the student's language, friendly). Pass the routing guide + location list into the prompt. Required details: hostel → building, floor, and the room number (or the common area) — never "which washroom"; Plumbing/Water → what's happening & severity; Electricity → which item & sparking?; Water Supply / Electricity (power cut) / Internet (Wi-Fi outage) → scope ("Only your room, or other rooms on this floor too?" → `room`|`floor`|`building`); Internet → Wi-Fi or LAN; Laundry → machine ID; Mess Food → which mess & meal.
2. Missing-info loop: chat-style. Exactly ONE follow-up round. If still missing after the student's reply, create the ticket anyway with details_incomplete = true.
3. Student sees a preview card (title, summary, category editable, department, priority, photo analysis) and confirms.
4. findDuplicates(newTicket) → DB candidates: same module, same category, same building, status not Resolved/Closed, last 7 days, narrowed by place: **room-scope issues match only the same building + room + category (so roommates get "Me too")**; floor-scope issues also match tickets from other rooms on that floor, building-scope issues across the building; tickets from different rooms are never duplicates unless the issue is floor/building-wide. Common-area, mess and academic tickets match by floor as before. If any, Gemini compares and returns per candidate: is_duplicate, similarity (0–1), reason. Before creating, offer student "This may already be reported as CC-xxxx — Me too, or submit as new?". If submitted as new and similarity ≥ 0.7 → duplicate_status 'flagged'. Staff can Merge or Not a duplicate.
5. moderateQuestion(text) → allowed / reason (block abuse, spam, gibberish, off-topic).
6. similarQuestions(text) → top related existing questions.
7. escalationBrief(context) → brief + recommended_action.
8. hotspotInsight(hotspot) → one-line recommendation.
All AI calls: timeout + graceful fallback (never crash the UI; show a friendly error and allow manual entry).

## 7. Escalation rules
Run `checkEscalations()` after any ticket create/update and when admin dashboards load (no cron needed). Create an escalation (no duplicates for same key while open) when:
- recurring (a): the same place + category has ≥3 tickets in 30 days — hostel: same ROOM (or same common area); academic: same block + floor
- recurring (b), hostel **floor-level issue**: ≥3 DIFFERENT rooms on the same floor with the same category within 7 days (hotspot key `hostel|<category>|<building>|<floor>|*`) — the escalation brief and the hotspot Gemini recommendation point at a shared cause (e.g. inspect the floor pipeline / main valve)
- reopened: reopen_count ≥ 2
- sla_breach: Urgent/High ticket not Resolved past sla_due_at
- manual: Warden/HOD clicks "Escalate"
Hostel → dean, Academic → hod. Escalated tickets show a red "Escalated" badge to staff and student. Dean/HOD can acknowledge and add a directive (also logged as a ticket event).

## 8. Screens
- /login (roll no + password, sign-up link, demo quick-login buttons), /signup
- / (student home): two large cards — "Hostel & Campus" and "Education"
- Hostel: Report (text, building, floor, then "A room" (pre-filled with the student's own room, "It's somewhere else") or "Common area" (Corridor, Staircase, Water cooler / RO, Laundry machine + machine ID, Gym, Mess, Other), photo with preview) → AI chat → preview → duplicate prompt → success with big ticket number; My Tickets (cards + vertical timeline, live via Realtime); ticket detail; after Resolved: "Fixed? Yes / No, reopen" + 1–5 star rating; Track by ticket number.
- Education: tabs "Academic Issues" (same report/track flow with academic routing) and "Open Q&A" (ask with subject + AI similar-questions + moderation; list with filters subject / unanswered / most upvoted / mine; question detail with answers, comments, upvote, asker marks best answer; teacher answers get a "Teacher" badge).
- Staff portal: stat cards (Open, Urgent, Possible Duplicates, Resolved Today); Kanban (Submitted / Assigned / In Progress / Resolved) + list view toggle; filters (module, category, department, priority, building, duplicates only); ticket detail drawer: amber duplicate banner with side-by-side comparison + Merge / Not a duplicate, AI panel (extracted issue, summary, category/department/priority with confidence + reason, photo analysis), original text + English translation, photo, assign dropdown, status change with note, overrides, full history. Hostel tickets show their place prominently ("Room 204" or the common area) plus an "Affects whole floor" badge for floor-scope tickets (cards, list view and drawer).
- Insights (warden/dean/hod): charts by category, by building, avg resolution time, rating avg; Hotspots list with Gemini recommendations.
- Escalations (dean/hod): list + detail with brief, linked tickets, acknowledge, directive.
- Teacher view: Q&A board focused on unanswered questions.
- Faculty workspace (teacher / hod / academic_office): see §14.

## 9. Design system
Inspired by a modern SaaS look (do NOT copy any other site's logo — make our own simple logo: two overlapping rounded rings or a chat-bubble + check mark).
- Background: off-white (#F8FAFC) with a faint grid pattern
- Primary: deep navy #0F172A (buttons, hero/feature cards, white text); accents: sky-blue tints (#EFF6FF, #DBEAFE) for cards, vivid accent #3B82F6 / violet #7C3AED sparingly
- Floating pill-shaped white navbar with soft shadow; rounded-3xl cards, thin slate borders, soft shadows; pill buttons
- Font: Manrope (fallback DM Sans) via next/font; big bold headings; small uppercase letter-spaced labels (e.g. "AI SUMMARY", "PRIORITY")
- Badges: priority Urgent=red, High=orange, Medium=amber, Low=slate; each category its own soft color + lucide icon
- Fully responsive: students get a bottom tab bar on mobile; staff get sidebar + board on laptop, stacked list on mobile
- Subtle motion (fade/slide), skeleton loaders, a friendly "AI is reading your complaint…" animation; empty states with helpful text

## 10. Seed data
Script `npm run seed` (uses service role): creates all demo accounts + ~25 realistic tickets across both modules, categories and buildings, with events/history, including:
- all hostel tickets are room-specific (`room_no`) or common-area (`spot`) — there are no "common washroom" tickets
- a room hotspot: 4 plumbing tickets in New Hostel room 204 (Aarav + roommate Kabir) within 30 days (→ recurring escalation); Aarav's tap-dripping ticket stays open so Kabir's identical complaint triggers "Me too"
- a floor-level pattern: low water pressure in 4 different rooms (204, 207, 212, 219) on New Hostel 2nd floor within 5 days, two of them `scope = floor` (→ floor-level escalation with a recommendation to inspect the floor pipeline)
- one overdue Urgent electrical ticket (sparking socket) → sla_breach escalation
- several resolved/closed tickets with ratings; 2 Hindi complaints
- ~8 Q&A questions (some answered by teachers, some unanswered)
Seed must be re-runnable (clears demo data first).

## 11. Working rules
- Work phase by phase; at the end of each phase list what to test manually and any dashboard/env steps.
- Keep code modular: `src/lib/ai`, `src/lib/supabase`, `src/config`, `src/components`, `src/app`.
- Prefer server actions/route handlers; type everything; no secrets client-side.
- Don't over-engineer; if something is ambiguous, pick the simplest option that satisfies this spec and note it.
- Before finishing a phase, run `npm run build` and fix all errors.

## 12. Safety & Security module (module = 'security') — Phase 5A
Third card on the student home: "Safety & Security" — "Your report is confidential".

### Routing guide — Safety & Security
| Category | Department | Priority | Confidential |
|---|---|---|---|
| Ragging | Anti-Ragging Committee | Urgent | always |
| Harassment / Bullying | Anti-Ragging Committee | Urgent | always |
| Threat / Fight / Violence | Security Office | Urgent | always |
| Theft / Lost item | Security Office | Medium | no |
| Unauthorized entry / Suspicious person | Security Office | High | no |
| Other safety concern | Security Office | Medium | student chooses |

Roles (seeded, password demo1234, on quick-login): `security_officer` "Mr. Yadav – Security Officer" (department Security Office); `arc` "Dr. Mehra – Anti-Ragging Committee Nodal Officer" (department Anti-Ragging Committee). Both use the normal staff board (Confidential lock badge on cards).

Confidentiality rules (enforced by RLS, not just UI):
- `tickets.is_confidential` tickets are visible ONLY to: the reporter, `arc` (all Anti-Ragging Committee tickets), the ASSIGNED security officer (confidential Security Office tickets are auto-assigned to a security officer on create), and `dean`. Warden, HOD, other staff and other students never see them.
- Excluded from: duplicate detection (whole security module skips it), "Me too", public tracking (whole security module), hotspots/recurring escalations (Insights shows only aggregated security counts), Q&A, and every list visible to other students/departments.
- Optional `tickets.hide_identity` ("Hide my name from the investigating staff"): only `arc` and `dean` see the reporter; everyone else sees "Confidential reporter". Security officers cannot read student profiles via RLS.
- Ragging / Harassment / Threat → Urgent + immediate escalation to dean with reason `safety`.
- Department overrides cannot move a security ticket out of the security departments (or a normal ticket into them).

AI for this module (`src/lib/ai/analyze.ts`, separate system prompt): calm, supportive, non-judgmental; never asks the student to justify themselves or name people; follow-ups only for WHEN and WHERE (max 2, one round). Returns `is_emergency` for immediate danger. Gemini safety settings relaxed to BLOCK_NONE for this call; if blocked/failed, the student picks the category manually and the ticket is still created — never a scary error.

Emergency panel (always on the Safety report page; red when `is_emergency`): Campus Security number from `src/config/safety.ts` (placeholder) or 112; National Anti-Ragging Helpline 1800-180-5522 (24x7, toll free), helpline@antiragging.in, www.antiragging.in; tel:/mailto: links.

## 13. Public ticket tracking (no login) — Phase 5A
- Tracking needs ONLY the ticket number (no PIN). The `tickets.tracking_pin` column still exists in the DB (filled by a default) but is unused — don't show or require it, and don't drop it.
- "Track a ticket" card on /login (ticket number only) and a public `/track` page; data from `POST /api/track`.
- Response contains ONLY: ticket no, module, category, building (no floor/spot), status, priority, created date, and public timeline events (status + time + generic actor role like "Estate staff"). No names, complaint text, photos or notes.
- Security tickets and wrong/unknown numbers return the same "Ticket not found".
- Rate limit: 10 lookups per IP per 10 minutes (in-memory, per server instance).
- The logged-in "Track by ticket number" keeps working (it also never shows security tickets).

## 14. Faculty workspace — report issues, My Reports, My Answers
Faculty = `teacher`, `hod`, `academic_office` (`src/config/faculty.ts`: `FACULTY_ROLES`, `isFaculty`, class-disruption helpers).
- **Sidebar:** teacher = Home (`/faculty` dashboard: unanswered questions by subject, my open reports with status, my recent answers), Q&A Board, Report an issue (`/report`), My Reports (`/reports`, `/reports/[ticketNo]`), My Answers (`/answers`, teacher only) + notification bell. hod / academic_office keep their existing items and get Report an issue + My Reports + bell.
- **Reporting:** reuses `ReportFlow` (`audience="faculty"`) → same AI chat → preview → duplicate check → `createTicket`. Faculty can only report the **Academic module**: Classroom Facilities, Lab Equipment, Library, Academic Admin, plus the faculty-only categories **Electricity, Internet, Cleanliness** in Blocks A–D (flagged `facultyOnly` in `ACADEMIC_ROUTING`, routed to Electrical Maintenance / IT Cell / Housekeeping). `categoriesFor(module, audience)` hides faculty-only categories from students. Hostel and Safety & Security stay student-only (enforced in `/api/ai/analyze`, `createTicket`, `followTicket`).
- **AI class rule:** if the faculty member mentions a class now or soon, priority is raised to at least High with reason "Disrupts a scheduled class" (`disrupts_class` from Gemini, backed by a regex; also applied in manual-entry fallback). The AI always asks for block + room, and the class time if a class is mentioned without one. Urgent safety hazards still win.
- **My Reports:** same `MyTicketsView` / `TicketPage` components as students' My Tickets (`basePath` `/reports`); live timeline; confirm fixed + rating / reopen use the same `confirmFixed` / `reopenTicket`. Only the reporter (or "Me too" followers) see a ticket there; internal events are hidden from reporters.
- **Staff side:** board cards, list rows and the drawer show a violet "Reported by faculty · name (role)" badge (`FacultyBadge`, `BoardTicket.faculty_reporter`). Duplicates and "Me too" work across student and faculty reports (same module + category + building).
- **RLS (schema.sql):** `tickets_insert` allows student/teacher/hod/academic_office reporters; `events_select` hides internal events from teachers and from staff on tickets they reported; `followers_select` excludes teachers; the notification trigger links faculty to `/reports/<no>`.
- **Seed:** Prof. Khan's "Projector not turning on in C-204" (Block C, 2nd floor, High, In Progress, Suresh).

## 15. Email notifications (nodemailer)
- **Addresses:** `profiles.email` is the contact address (login stays `<rollno>@campusconnect.app`). It must end with `@<COLLEGE_EMAIL_DOMAIN>` (default `zenithschool.ai`, case-insensitive, rules in `src/config/email.ts`; the client forms get the domain as a prop). Students enter it at sign-up (pre-filled `<rollno>@zenithschool.ai`, editable; error "Please use your college email (@zenithschool.ai)"); every user can change it on `/profile` (user menu → Profile). Emails are unique. Users without an email are simply not emailed.
- **Sending:** `src/lib/email/` — `send.ts` (SMTP transport from env, `inBackground()` = Next.js `after()`, `deliver()` logs every attempt to `email_log`), `templates.ts` (navy/white HTML + plain text), `notify.ts` (who gets what). Missing `SMTP_HOST` = skipped silently. Failures are logged (`email_log.status = 'failed'` + error) and never affect the user's action. Gmail SMTP (App password) or Mailpit (`localhost:1025`, no auth).
- **Demo redirect:** if `DEMO_NOTIFY_EMAIL` is set, mail for seeded demo accounts (`isDemoEmail`) goes there with "[Demo: originally to x@zenithschool.ai]" on top; real users get mail at their own address. `npm run seed` gives every demo account an address (students `<rollno>@`, staff name-based like `ramesh@`, `dr.iyer@`, `prof.das@`).
- **Emails:** ticket created → reporter; Assigned / In Progress / Resolved (staff note + "Please confirm it's fixed") → reporter + all followers ("Me too" and merged); Merged into CC-xxxx → duplicate's reporter + followers; assignment → assigned staff; escalation → Dean/HOD with AI brief + recommended action (sent once, after the brief is written; `escalations.emailed_at`); teacher answer → the student who asked.
- **Confidential Safety tickets:** only the reporter, `arc` (own department) and `dean` are emailed, and the email only says "Update on your confidential report CC-xxxx — open the app to view". No details, never to the assigned security officer, warden or HOD.
- **Email log:** `/email-log` (warden, dean) shows recent sends and failures; the warden never sees rows about Safety tickets.
- **Schema:** `profiles.email` (+ unique index), `escalations.emailed_at`, `email_log` table (RLS: warden/dean read). Re-run `schema.sql` after pulling.
