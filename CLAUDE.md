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
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `NEXT_PUBLIC_COLLEGE_NAME`; email (§15): `COLLEGE_EMAIL_DOMAIN`, `APP_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `DEMO_NOTIFY_EMAIL`; WhatsApp (§18): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `DEMO_NOTIFY_WHATSAPP`, `WHATSAPP_AUTOMATED_ENABLED`; demo helper (§19): `NEXT_PUBLIC_DEMO_MODE`
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
- Students: Aarav Mehta (2616400101, New Hostel, room 204), Priya Singh (2616400102, Old Hostel Girls Wing, room G-108), Rahul Verma (2616400103, Old Hostel Boys Wing, room B-305), Kabir Khanna (2616400104, New Hostel, room 204 — Aarav's roommate, for the "Me too" demo). Three more seeded New Hostel 2nd-floor students (Vikram 207, Ishaan 212, Dev 219; `hidden: true` in `demo-accounts.ts`, no quick-login button) exist only to make the floor-level seed pattern realistic; two more hidden students (Ananya 2616400108, Sahil 2616400109) make Prof. Das's feedback count 8 (§22).
- Staff: Ramesh, Mahesh (Estate / Maintenance); Suresh, Dinesh (Electrical Maintenance); Kamla, Sunita (Housekeeping); Rohit, Ankit (IT Cell); Mr. Sharma (Mess Committee); Mr. Gupta (Lab In-charge); Ms. Nair (Library Staff); Mrs. Kapoor (Academic Office)
- Warden: Mr. Rao · Dean: Dr. Iyer (Dean of Student Affairs) · HOD: Dr. Banerjee · Teachers: Prof. Das, Prof. Khan

## 5. Data model (Supabase)
- profiles: id (= auth.users.id), full_name, roll_no (unique, nullable for non-students), role, department (nullable), hostel, wing, room, email, phone (E.164, nullable), whatsapp_optin bool, created_at
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
- Lost & Found (students, faculty, security officer, warden): see §20.
- Education tab "Ask my teacher" (private doubts), teacher Doubt inbox, warden/HOD Subject teachers: see §21.
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
- **Notification log:** `/email-log` (warden, dean; nav label "Notification log") shows recent email AND WhatsApp sends, failures and skips with a channel column (see §18); the warden never sees rows about Safety tickets.
- **Schema:** `profiles.email` (+ unique index), `escalations.emailed_at`, `email_log` table (RLS: warden/dean read). Re-run `schema.sql` after pulling.

## 16. Complaint moderation (text + photo, inside the analyze call)
- **One Gemini call:** `analyzeComplaint` also returns `text_moderation {level: allow|rephrase|block, reason}` and, only when a photo is attached, `photo_moderation {level: allow|privacy|block, reason, contains_people}` (`buildAnalysisSchema(module, audience, hasPhoto)`, rules in `moderationRules()` in `src/lib/ai/analyze.ts`, levels/messages in `src/config/moderation.ts`). No second moderation call. The analysis call now uses relaxed Gemini safety filters for every module so abusive text/images are classified instead of refused.
- **Text:** allow = normal complaints incl. angry/informal tone and mild slang (summary/title/english_text are always clean and professional); rephrase = insults/slurs/abuse aimed at a person → back to the form with "Please rephrase without abusive language — your complaint still matters", text/photo/location kept; block = spam, gibberish, obvious jokes/fakes, threats, sexual content → polite reason, nothing submitted. **Safety module:** never `rephrase` (coerced to allow in code); only clear spam/gibberish is blocked. Faculty reports use the same rules. Q&A keeps its own moderation (`moderatePost`). In round 2 the student's reply is moderated too (rephrase stays in the chat, block returns to the form).
- **Photo:** allow = the issue/place; privacy = identifiable faces → "This photo shows people. Please retake it without faces."; block = explicit/gory/offensive/memes/unrelated. Rejected photos are removed from the form and **deleted from storage** by `/api/ai/analyze` (and their `photo_analysis` dropped); the student can retake or continue without. If Gemini's own safety filter refuses a request that has a photo, the photo is dropped and treated as blocked and the text is analysed alone (the only extra call, failure path only). **Safety module:** a photo with people is allowed as evidence (`ai_meta.photo_has_people`), and the photo URL/analysis is removed server-side (`redactPhoto` in `staff-queries.ts`) for everyone except `arc` and `dean`.
- **Failures:** if the AI is unavailable (or the photo can't be read for checking) the complaint is still allowed, `ai_meta.moderation = "unchecked"` and staff see a grey "Not moderated" badge (cards, list, drawer); checked tickets store `"passed"`.
- **Log + flag:** `moderation_log` (user_id, roll_no, module, kind, level, reason — never the complaint text) records every rephrase/privacy/block. 3+ `block` rows in 24h list the roll number (faculty: name) with the count on the warden's Ticket Board (`ModerationFlags`). No automatic bans.
- **Limit:** moderation runs in the report flow (browser → `/api/ai/analyze`); `createTicket` trusts the result, like the rest of the flow.
- **Schema:** adds `moderation_log` (RLS: warden reads).

## 17. Theme (light / dark / system)
- **One source of truth:** `scripts/theme-tokens.json` (light + dark value for every token) → `npm run theme:build` writes `src/app/globals.css`. Never edit the generated token block by hand.
- **Tokens:** `--bg --surface --surface-2 --surface-inverse --border --text --text-muted --text-inverse --primary --primary-fg --accent --input-bg --input-border --placeholder --ring`, plus a `-bg`/`-fg` pair for success, warning, danger, info, violet, neutral, every priority (`prio-*`) and category (`cat-*`). Tailwind utilities: `bg-surface`, `text-text-muted`, `bg-warning-bg text-warning-fg`, ...
- **Rules:** use no raw palette colours (`bg-white`, `text-slate-500`, `border-amber-200`, hex/rgb) in `src/`; a `*-bg` / surface token is always used with its matching `*-fg` / text token. `npm run check:theme` enforces both and checks WCAG contrast of every pair in both modes; run it before committing UI changes.
- Toggle: `src/components/theme/theme-toggle.tsx` (next-themes, class strategy, default System).

## 18. WhatsApp (share buttons now; automated alerts behind a flag)
- **Automated sending is OFF by default.** `WHATSAPP_AUTOMATED_ENABLED=true` turns on the Twilio code below; when unset/false `deliverWhatsApp()` returns immediately (no Twilio call, nothing logged). Reason: the Twilio trial sender only allows pre-approved templates without variables ("ContentSid Required"); production needs Meta-approved templates with variables.
- **Share on WhatsApp buttons** (`src/components/common/whatsapp-share.tsx`, plain `https://wa.me/?text=` links, no API/accounts, WhatsApp-green `bg-whatsapp`/`text-whatsapp-fg` tokens): student `TicketDetail` (also faculty My Reports) and the report success screen share ticket no + title + status + `APP_URL/track?no=CC-xxxx`; the staff drawer's Reporter section has "Send update on WhatsApp" (ticket no, status, latest visible note, track link) that opens `wa.me/<digits>` directly when the reporter has a `profiles.phone`. Hidden for confidential/security tickets and hidden reporters. `/track?no=` pre-fills and auto-looks-up the ticket.
- Profile: phone field kept; toggle reads "Automated WhatsApp alerts — coming soon".
- Automated-flow details (only when the flag is on):
- **Same events as email (§15):** ticket created, assigned, in progress, resolved ("Reply in the app to confirm it's fixed" + link), merged, escalation → Dean/HOD, teacher answered, staff assignment. Short plain-text messages (<500 chars) with ticket number, status and an `APP_URL` link. Code: `src/lib/email/whatsapp.ts` (Twilio REST via the `twilio` package, server-only, `deliverWhatsApp()`), called from `wa()` in `notify.ts` right next to each email send, inside `inBackground()` so a failure never blocks the user.
- **Env:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` (secret, server-only), `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886`), `DEMO_NOTIFY_WHATSAPP` (E.164). If any is missing nothing is sent and the attempt is logged as `skipped` ("X is not set").
- **Opt-in:** `profiles.phone` (E.164) + `profiles.whatsapp_optin`, set on `/profile` ("WhatsApp updates"; note: in the sandbox each person must first send the join code to the Twilio number). Only opted-in people with a number are messaged.
- **Demo accounts:** messages for seeded demo accounts (no opt-in needed) go to `DEMO_NOTIFY_WHATSAPP`, prefixed "[Demo: for Aarav Mehta]".
- **Confidential Safety tickets:** same recipients as email (reporter, `arc`, `dean`) and only "Update on your confidential report CC-xxxx — open the app to view", never details.
- **Log:** `email_log` is shared by both channels: `channel` ('email'|'whatsapp'), `status` ('sent'|'failed'|'skipped'), `to_email` holds the address or phone number, `error` holds the failure/skip reason. Re-run `schema.sql` after pulling.

## 19. Auto-assignment + SLA watcher
- **Staff availability:** `profiles.on_leave` (bool), `profiles.preferred_buildings` (text[]), `profiles.last_assigned_at`. Staff toggle their own "I'm on leave" in the Ticket Board header (`OnLeaveToggle`); warden/dean manage everyone on `/directory` ("Staff directory", grouped by department: name, open tickets, on-leave switch, preferred buildings editor). Seed: Sunita is on leave; Ramesh/Mahesh/Suresh/Dinesh/Kamla/Rohit/Ankit have preferred buildings (`demo-accounts.ts`).
- **Auto-assign** (`src/lib/assignment.ts`, `autoAssignTicket`): runs in `createTicket`, on reopen (student `reopenTicket`, `wardenReopenTicket`) and after a department override leaves a ticket unassigned. Candidates = `staff`/`academic_office` of the ticket's department, not on leave → preferred building first → fewest open jobs (Assigned / In Progress / Reopened) → least recently assigned (`last_assigned_at`). Sets status Assigned, `assigned_auto = true`, event "Auto-assigned to <name> — <reason>" (e.g. "fewest open jobs (1)"), emails + bell to the staff member (`notifyStaffAssigned`) and the student (`notifyTicketStatus`). Nobody available → stays unassigned, internal note + alert to the warden (HOD for academic). Never auto-assigned: "Other" (warden triage lane), Safety & Security tickets, confidential tickets.
- **Settings** (`app_settings` table, warden edits on `/directory`): auto-assign on/off per department (key `auto_assign_disabled`, default on) and "auto re-assign manual assignments" (`reassign_manual`, default off).
- **SLA watcher** (`src/lib/sla-watcher.ts`, `runSlaWatcher()`, idempotent — every step claims its ticket with a guarded UPDATE): (1) at 75% of the SLA window (`sla_started_at` or `created_at` → `sla_due_at`) one reminder to the assignee (email + WhatsApp flag + bell, `sla_reminded_at`, internal event); (2) deadline missed → `pickAssignee` excluding everyone in `assignment_history` + the current assignee, status Assigned, fresh `sla_due_at`/`sla_started_at` from now by priority, `reassign_count + 1`, history entry, event "Reassigned from <old> to <new>: deadline missed", alerts to warden (HOD for academic), old and new staff; (3) second missed deadline (`sla_breach_count >= 2`) → `sla_breach` escalation to the Dean/HOD (`createSlaBreachEscalation`). Manually assigned tickets (`assigned_auto = false`): reminder + "flagged" alert only, no re-assignment, unless `reassign_manual` is on; a flagged ticket keeps its overdue deadline and `sla_reminded_at >= sla_due_at` marks it handled. Urgent/High tickets nobody auto-assigned still escalate at their first miss (legacy rule in `checkEscalations`, `assigned_auto = false` only). **Confidential Safety tickets:** never re-assigned; arc (own department) + Dean get content-free reminders (`notifyStaffAlert` filters recipients itself).
- **Running it:** called when the staff board, escalations, insights and staff directory pages load (throttled to once a minute per server instance) and by "Run SLA check now" (warden/dean, board header + directory). TODO in `sla-watcher.ts`: schedule it with Supabase pg_cron + pg_net hitting a protected route.
- **Waiting for parts / external dependency:** staff drawer, only on In Progress tickets, note required (`pauseTicketSla`) → `sla_paused_at`, `waiting_reason`, student-visible note, grey "Waiting on parts" badge, "SLA paused" countdown, watcher skips it. "Resume work" (`resumeTicketSla`) or any status change extends `sla_due_at` by the paused time (`resumeSlaFields`, `sla_paused_seconds`). Board filter "Waiting on parts".
- **Demo helper:** warden/dean drawer button "⏩ Simulate deadline passed" sets `sla_due_at` to 1 minute ago (only when `NEXT_PUBLIC_DEMO_MODE=true` or `npm run dev`; `DEMO_MODE` in `config/assignment.ts`), then "Run SLA check now".
- **UI:** violet "Auto-assigned" and amber "Reassigned ×n" badges on cards, list rows and the drawer; SLA countdown grey → amber at 75% → red when overdue; history shows every auto event; Insights → Department performance has a "Reassignments" column.
- **Schema:** adds the columns above on `profiles` / `tickets` and the `app_settings` table — re-run `schema.sql` after pulling; re-run `npm run seed` for the new staff data.

## 20. Lost & Found (students + faculty report, `security_officer` manages)
- **Who:** `student`, `teacher`, `hod`, `academic_office` post items and claim found ones (`LF_REPORTER_ROLES` in `src/config/lost-found.ts`). `security_officer` runs the desk (approve/reject claims, confirm matches, mark returned, dispose). `warden` sees everything read-only. Dean, `staff` and `arc` have no access. Routes: `/lost-found` (listing, tabs **Lost / Found / My items**), `/lost-found/report`, `/lost-found/[id]`, `/lost-found/desk` (officer + warden). The layout (`src/app/lost-found/layout.tsx`) picks the student or staff shell by role; "Lost & Found" is a student top/bottom tab and a sidebar item for faculty, security officer and warden. The security officer now also gets the notification bell.
- **Data (schema.sql, re-run it):** `lost_found_items` (type lost|found, `item_no` `LF-101…`, `description` = reporter's own words (private), `public_description` = AI-cleaned text everyone reads, item_category, color, brand, marks, `sensitive`, building, spot, happened_at, photo_url + `photo_path`, status open|matched|claimed|returned|expired, held_at security_office|with_finder, pickup_note, verification_question + `verification_answer` (never shown to claimants), `disposition` disposed|donated), `lost_found_matches` (lost_id, found_id, score, reason, status suggested|confirmed|rejected), `lost_found_claims` (item_id = the found item, claimant_id, optional `lost_id`, answer, match_score/match_reason copied at claim time, status pending|approved|rejected, reviewed_by, review_note), `lost_found_log` (audit trail: actor name + roll number, action, detail). `reset_lost_found_seq()` is used by the seed.
- **RLS is the safety net, not the filter:** reporters only read their own items/claims; `security_officer` and `warden` read everything. The public listing is built on the server (`src/lib/lost-found/queries.ts`, service role) and sanitised by `toPublic()`: no reporter id/name, others read `public_description` instead of the raw text, `verification_answer` is never sent, and for **sensitive** items (always Phone, Wallet, ID card, Laptop / charger, or AI/reporter flagged) brand and marks are hidden and the photo URL is replaced by `/api/lost-found/photo/[id]`, a server-side `sharp` blur (fails closed). Owner and staff get the real photo. Names and roll numbers are only attached for security officer / warden (desk, item page staff section).
- **Report flow** (`ReportItemFlow`): form (lost/found, text, building, spot, date-time, optional photo, found: held at Security Office or with finder) → `POST /api/lost-found/analyze` (ONE Gemini call, `src/lib/ai/lost-found.ts`: title, clean public description, item_category, color, brand, marks, `sensitive`, verification question for found items, plus the **same** `text_moderation` / `photo_moderation` rules as complaints via `moderationRules()`; a face printed on an ID card is not a person; rephrase/block/privacy go back to the form, rejected photos are deleted from storage, logged in `moderation_log` with module `lost_found`) → editable preview (category, colour, brand, marks, public description, sensitive checkbox, verification Q/A) → `createLostFoundItem`. AI down → the preview opens empty and the post is saved with `ai_meta.moderation = "unchecked"`. Numbers of 6+ digits are scrubbed from titles/public text (`scrubNumbers`).
- **Matching** (`runMatching` in `src/lib/lost-found/core.ts`, runs after create via `inBackground`): opposite type, status open/matched, created in the last **14 days**, not the same reporter, same category (or either "Other"), not already paired. `scoreMatches` sends descriptions + up to 6 photos to Gemini (score 0–1 + reason; keyword fallback if Gemini fails). **Score ≥ 0.7** (`LF_MATCH_THRESHOLD`) is saved as a `suggested` match and both people get "A possible match was found" (email + WhatsApp flag + in-app bell, `src/lib/email/lost-found-notify.ts`, same helpers/demo redirect/`email_log` as tickets). Suggestions do not change item status; the officer's **Confirm** sets both items `matched` and tells the owner to claim.
- **Claim flow:** on a found item (not your own, open/matched) "This is mine" → the owner answers the verification question (or describes a hidden detail) → `lost_found_claims` row (links their matched lost report + AI reason automatically) → officer notified → desk shows found item vs claimant's lost report side by side, AI match reason, expected vs given answer → **Approve** (item `claimed`, linked lost report `claimed`, other pending claims auto-rejected, claimant told "Collect it from the Security Office", finder asked to hand it in if `with_finder`) or **Reject** (with note). Officer **Mark received** (finder → office) then **Mark returned** at handover (needs `held_at = security_office`); both sides become `returned`, finder thanked. Everything is written to `lost_found_log` with roll numbers.
- **Desk** (`LostFoundDesk`): stat cards; Pending claims; Suggested matches (Confirm / Not a match); Held at the Security Office (verification Q/A editor, Mark returned for claimed items); Still with the finder (Mark received); **30-day expiry list** (found items 25+ days old, `LF_EXPIRY_DAYS` / `LF_EXPIRY_WARN_DAYS`, buttons Donated / Disposed → status `expired` + `disposition`); activity log. Warden sees it read-only.
- **Safety link:** a Safety report categorised "Theft / Lost item" shows `LostFoundHint` on the preview card ("Lost something rather than stolen? Post it in Lost & Found") linking to `/lost-found/report?type=lost&text=…&building=…&spot=…` (form pre-filled). That category is never confidential.
- **Seed:** 4 found (black JBL earbuds at Block B library [Priya found; verification answer "A small white star sticker"], blue water bottle at Sports Complex [with finder], College ID card at New Hostel Mess [sensitive], black umbrella at Block A [27 days old → on the expiry list]) and 2 lost (Rahul's black earbuds → suggested 86% match with the JBL earbuds, Priya's physics textbook).

## 21. Ask my teacher (private doubts)
- **Mapping:** `profiles.subjects text[]` on each teacher is the live subject -> teacher mapping. Defaults live in `src/config/subjects.ts` (`DEFAULT_SUBJECT_TEACHERS`: Mathematics / Programming / Introduction to AI -> Prof. Das; Physics / Basic Electrical / Environmental Studies -> Prof. Khan; General Studies / Communication Skills -> both) and `npm run seed` writes them. Warden and HOD edit them on `/subjects` ("Subject teachers", `saveTeacherSubjects`); teachers see "My subjects" on `/profile` and the faculty home. "Other" is not offered (no teacher). A subject with no teacher cannot receive doubts (the form says so).
- **Student side:** Education has a third tab **Ask my teacher** (`/education?tab=ask`): list of my doubts + "New doubt" (`/education/doubts/new`: subject -> the mapped teacher(s) appear -> title, details, optional photo uploaded to the `complaint-photos` bucket). While typing, "Similar questions already answered" comes from `POST /api/ai/similar-questions` (answered public questions only). Thread page: `/education/doubts/[id]`.
- **Private thread:** tables `doubt_threads` (student_id, subject, title, `status` open|answered|closed, photo, `public_status` none|requested|published|declined, `public_message_id`, `public_question_id`, `last_sender`, `last_message_at`, `reminder_sent_at`) and `doubt_messages` (sender student|teacher|system). Visible only to the student, the teacher(s) whose `subjects` contain the thread's subject (`is_subject_teacher()`), and the HOD (read-only). Enforced by RLS (schema.sql) and again in `canAccessThread()` (`src/lib/doubts/queries.ts`, service role). Teachers and HOD see the student's name + roll number. Status: a student message sets `open`, a teacher reply sets `answered`, either side can close.
- **Moderation:** every doubt and reply goes through `moderatePost()` (the Q&A board's Gemini moderation; if the AI is down it is allowed and flagged "Not moderated"). Photos are not scanned. Blocked text returns a polite reason inline.
- **Notifications** (`src/lib/email/doubt-notify.ts`, reuses `deliverAlert`: bell + email + WhatsApp flag, demo redirects, `email_log`): new doubt / follow-up -> the subject's teachers; teacher reply -> the student; make-public request -> the student; published -> the answering teacher; 48h reminder -> the subject's teachers.
- **Teacher tools:** `/doubts` **Doubt inbox** (nav "Doubt inbox"; unanswered first, longest waiting at the top, answered/closed below; HOD sees all subjects read-only), `/doubts/[id]`. **Draft with AI** (`POST /api/doubts/draft`, reuses `draftAnswer`) only fills the reply box; Send stays disabled until the teacher edits the text or ticks "I have read this draft and it is correct". **Make public** sits under each of the teacher's own replies: it asks the student; the student sees the exact question + answer and agrees (`respondPublic`) or declines. On agree a `questions` row is created with `anonymous = true` (shown as "Anonymous student" everywhere in the Q&A UI, `ANONYMOUS_AUTHOR`) plus the teacher's reply as an `answers` row; the photo and the rest of the chat are not copied.
- **Reminder:** `runSlaWatcher()` (same watcher, throttled once a minute; also runs when `/doubts` or the faculty home load) sends one reminder per unanswered student message when `status = open` and `last_message_at` is older than 48h (`DOUBT_REMINDER_HOURS`, claimed with a guarded UPDATE of `reminder_sent_at`; a new student message re-arms it).
- **Seed:** Aarav's Mathematics doubt (open, 3 days old -> the reminder fires) and Priya's Physics doubt (answered by Prof. Khan).

## 22. Anonymous teacher feedback + formal concerns
- **Config:** `src/config/feedback.ts` (questions, `FEEDBACK_MIN_RESPONSES = 5`, `currentTerm()` e.g. `2026-Odd` Jul–Dec / `-Even` Jan–Jun, `FEEDBACK_TERM` env overrides, concern categories/limits, 72h ack window). AI in `src/lib/ai/feedback.ts`: ONE Gemini call per submission (`moderateFeedbackText`: allow / rephrase / block, `has_facts`, `is_misconduct`, `photo_ok`, a neutral one-line summary) with relaxed safety filters, plus `summariseFeedback` (themes only, never quotes).
- **Rate my teachers (students):** Education tab **Rate my teachers** (`/education?tab=feedback`) lists every teacher x subject (from `profiles.subjects`); five 1–5 star questions (clarity, doubt solving, punctuality, fairness, respect) + optional comment, once per (student, teacher, subject, term) (`teacher_feedback` unique). Note shown: "Your feedback is anonymous — teachers, HOD and Dean never see your name." Actions in `src/lib/feedback/actions.ts` (`submitFeedback`).
- **Moderation (same three levels as complaints):** honest/blunt criticism = allow; insults, slurs, gaalis (English/Hindi/Hinglish) = **rephrase** ("Please rephrase without abusive language — your feedback still matters.", ratings and text stay in the form); spam, gibberish, threats, sexual content = **block** (polite reason, nothing saved). No comment = no AI call. AI down = accepted, `moderation = 'unchecked'`, HOD sees a grey "Not moderated" badge. Feedback moderation is deliberately NOT written to `moderation_log` (it would tie a roll number to a rating).
- **Anonymity:** `teacher_feedback.student_id` only enforces one-per-term. `src/lib/feedback/queries.ts` selects `ANON_COLUMNS` only (no `student_id`, no `created_at`; comments ordered by random id, not time), so no page/API returns who wrote what. RLS: a student can read only their own row; no policy for anyone else; `feedback_summaries` has RLS on and no policies (server only). Nothing is ever emailed or notified about individual feedback.
- **k-anonymity:** averages, comments and AI themes appear only when a teacher/subject/term has >= 5 responses; below that only "n so far". **Teacher** (`/feedback`, nav "My feedback"): per-subject averages + overall + the AI themes, never comments. **HOD** (Dean read-only) (`/teacher-feedback`): same plus every comment word for word as "Anonymous student" with the neutral one-liner and "Not moderated" badges. Themes are cached in `feedback_summaries` (response_count) and regenerated when the count changes (lazily on page load and in the background after a submit).
- **Formal concerns ("Report a concern", `/education/concern`):** teacher, subject, category (Unfair marking, Absence / irregular classes, Disrespectful behaviour, Discrimination, Harassment or sexual misconduct, Other), what happened, when, optional evidence photo (checked in the same Gemini call). "Your report is anonymous." A concern with only insults and no facts gets "Please describe what happened, when, and in which class."; never blocks a genuine serious complaint. Max 3 per student per term per teacher (`teacher_concern_identity`).
- **Routing:** normal concerns = a confidential **academic ticket** (`tickets.teacher_complaint = true`, `is_confidential`, `hide_identity`, category "Teacher Concern", department "Head of Department", no SLA clock) plus a `teacher_concerns` row (teacher, subject, term, category, neutral summary). **Harassment or sexual misconduct** (chosen, or detected by Gemini) goes to the existing Safety module instead (Anti-Ragging Committee + Dean, immediate Dean escalation). **Discrimination** escalates to the Dean immediately; anything the HOD has not acknowledged within **72h** escalates to the Dean (`escalateStaleConcerns()` runs in `runSlaWatcher()` and when `/concerns` loads). Concern escalation state lives on `teacher_concerns` (`escalated_at`, `escalation_reason`) and `tickets.escalated`, NOT in `escalations`, so confidential concerns never appear in the generic escalation lists/briefs.
- **Visibility:** shown everywhere as "Anonymous student". HOD and Dean read concerns only on `/concerns` and `/concerns/[ticketNo]` (server pages, `src/lib/concerns/queries.ts`, explicit columns, `reporter_id` never selected). Concern tickets are excluded from the staff board/history (`scoped()` adds `teacher_complaint = false`), `canViewStaffTicket`/`canSeeReporter` refuse them, `can_view_ticket()` (schema.sql) no longer lets the Dean read them through RLS, and public/logged-in tracking and "Me too" skip them. The teacher cannot see them or any count. HOD/Dean actions (`src/lib/concerns/actions.ts`): Acknowledge (-> Assigned), notes (internal or student-visible), Close with a student-visible outcome (-> Closed), HOD "Escalate to Dean". The student follows progress in My Tickets (events show "Head of Department" / "Dean's office", never a name) and gets bell + email (`src/lib/email/concern-notify.ts`); HOD gets a generic "new concern" alert; Dean gets escalations. Nobody else is notified.
- **Sealed identity:** the reporter id is stored (`tickets.reporter_id`, `teacher_concern_identity`) and never shown. Only the **Dean** has "Reveal identity for investigation" on a concern (never on ratings): a reason of >= 15 characters is required, the name + roll number are shown once in a dialog, and a row is written to `identity_reveal_log` FIRST (no log, no reveal). The Dean's **Audit log** (`/audit`) lists who, when, why.
- **Nav / routes:** teacher "My feedback" (`/feedback`); hod + dean "Teacher feedback" (`/teacher-feedback`) and "Teacher concerns" (`/concerns`); dean "Audit log" (`/audit`). Access rules in `ROUTE_ACCESS`.
- **Schema (re-run `schema.sql`):** `tickets.teacher_complaint`, tables `teacher_feedback`, `feedback_summaries`, `teacher_concerns`, `teacher_concern_identity`, `identity_reveal_log`, and the updated `can_view_ticket()`.
- **Seed (re-run `npm run seed`):** two more hidden students (Ananya Rao 2616400108, Sahil Bansal 2616400109); 8 anonymous ratings + a cached AI summary for Prof. Das / Mathematics (Aarav has not rated, for the demo); one anonymous "Absence / irregular classes" concern about Prof. Khan (Physics), unacknowledged.
