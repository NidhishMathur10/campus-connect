-- =====================================================================
-- CampusConnect — Supabase schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to re-run: it only creates what is missing and replaces policies.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('student','staff','warden','dean','hod','teacher','academic_office');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_module as enum ('hostel','academic');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_status as enum ('Submitted','Assigned','In Progress','Resolved','Closed','Reopened','Merged');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_priority as enum ('Low','Medium','High','Urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.duplicate_status as enum ('none','flagged','merged','dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ticket_event_type as enum (
    'created','status_change','assigned','note','duplicate_flagged','merged',
    'duplicate_dismissed','override','escalated','reopened','rating','me_too');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.escalation_reason as enum ('recurring','reopened','sla_breach','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.escalation_target as enum ('dean','hod');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.escalation_status as enum ('open','acknowledged','resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.question_status as enum ('open','answered');
exception when duplicate_object then null; end $$;

-- Phase 5A: Safety & Security module. New enum values are only compared as text
-- below (::text), so this file still runs in one go.
alter type public.user_role add value if not exists 'security_officer';
alter type public.user_role add value if not exists 'arc';
alter type public.ticket_module add value if not exists 'security';
alter type public.escalation_reason add value if not exists 'safety';

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  roll_no     text unique,
  role        public.user_role not null default 'student',
  department  text,
  hostel      text,
  wing        text,
  room        text,
  created_at  timestamptz not null default now()
);

create sequence if not exists public.ticket_no_seq start with 1001;

create table if not exists public.tickets (
  id                 uuid primary key default gen_random_uuid(),
  ticket_no          text not null unique default ('CC-' || nextval('public.ticket_no_seq')),
  module             public.ticket_module not null,
  reporter_id        uuid not null references public.profiles(id) on delete cascade,
  original_text      text not null,
  language           text not null default 'en',
  english_text       text,
  title              text not null,
  summary            text,
  category           text not null,
  department         text not null,
  priority           public.ticket_priority not null default 'Medium',
  ai_meta            jsonb,
  photo_url          text,
  photo_analysis     jsonb,
  building           text,
  floor              text,
  spot               text,
  machine_id         text,
  status             public.ticket_status not null default 'Submitted',
  details_incomplete boolean not null default false,
  assigned_to        uuid references public.profiles(id) on delete set null,
  duplicate_of       uuid references public.tickets(id) on delete set null,
  duplicate_score    real,
  duplicate_reason   text,
  duplicate_status   public.duplicate_status not null default 'none',
  escalated          boolean not null default false,
  reopen_count       int not null default 0,
  rating             int check (rating between 1 and 5),
  feedback           text,
  sla_due_at         timestamptz,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.ticket_events (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_name  text,
  actor_role  public.user_role,
  type        public.ticket_event_type not null,
  from_status public.ticket_status,
  to_status   public.ticket_status,
  note        text,
  created_at  timestamptz not null default now()
);

-- Phase 5A: confidential safety reports + PIN for public tracking.
alter table public.tickets add column if not exists is_confidential boolean not null default false;
alter table public.tickets add column if not exists hide_identity   boolean not null default false;

-- 4 characters without look-alikes (no O/0/I/1).
create or replace function public.gen_tracking_pin()
returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 4)
$$;
alter table public.tickets add column if not exists tracking_pin text;
update public.tickets set tracking_pin = public.gen_tracking_pin() where tracking_pin is null;
alter table public.tickets alter column tracking_pin set default public.gen_tracking_pin();
alter table public.tickets alter column tracking_pin set not null;

-- Phase 5C: hostel location model. Every hostel room has its own attached washroom,
-- bathroom and balcony (no common washrooms), so a ticket stores the ROOM NUMBER, or a
-- common area in `spot` (Corridor, Staircase, Water cooler / RO, ...). `scope` says how many
-- rooms an issue affects: 'room' | 'floor' | 'building' (asked for water / power cut / internet).
alter table public.tickets add column if not exists room_no text;
alter table public.tickets add column if not exists scope   text;
do $$ begin
  alter table public.tickets add constraint tickets_scope_check check (scope in ('room','floor','building'));
exception when duplicate_object then null; end $$;

-- Phase 3: staff-only notes (hidden from students).
alter table public.ticket_events add column if not exists is_internal boolean not null default false;

create table if not exists public.ticket_followers (
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

create table if not exists public.escalations (
  id                 uuid primary key default gen_random_uuid(),
  module             public.ticket_module not null,
  ticket_id          uuid references public.tickets(id) on delete cascade,
  hotspot_key        text,
  reason             public.escalation_reason not null,
  target_role        public.escalation_target not null,
  brief              text,
  recommended_action text,
  affected_count     int not null default 1,
  status             public.escalation_status not null default 'open',
  directive          text,
  created_at         timestamptz not null default now()
);

-- Phase 4: AI brief fields + lifecycle timestamps on escalations.
alter table public.escalations add column if not exists headline        text;
alter table public.escalations add column if not exists urgency_reason  text;
alter table public.escalations add column if not exists brief_model     text;
-- affected_count at the time the brief was written (regenerate when it changes).
alter table public.escalations add column if not exists brief_count     int;
alter table public.escalations add column if not exists acknowledged_at timestamptz;
alter table public.escalations add column if not exists resolved_at     timestamptz;
alter table public.escalations add column if not exists updated_at      timestamptz not null default now();

-- Phase 4: cached Gemini one-liners for Insights hotspots.
create table if not exists public.hotspot_insights (
  hotspot_key    text primary key,
  module         public.ticket_module not null,
  recommendation text not null,
  ticket_count   int not null,
  model          text,
  generated_at   timestamptz not null default now()
);

create table if not exists public.questions (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references public.profiles(id) on delete cascade,
  subject        text not null,
  title          text not null,
  body           text not null,
  status         public.question_status not null default 'open',
  best_answer_id uuid,
  upvotes        int not null default 0,
  created_at     timestamptz not null default now()
);

create table if not exists public.answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table public.questions
    add constraint questions_best_answer_fk foreign key (best_answer_id)
    references public.answers(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Short comments under an answer (Q&A "comments").
create table if not exists public.answer_comments (
  id         uuid primary key default gen_random_uuid(),
  answer_id  uuid not null references public.answers(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.question_votes (
  question_id uuid not null references public.questions(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);

-- Phase 5B: Q&A moderation, answer votes, notifications.
-- pending_review = Gemini moderation was unavailable, so a teacher should look at it.
-- hidden = soft-deleted by a teacher (with a reason).
alter table public.questions       add column if not exists pending_review boolean not null default false;
alter table public.questions       add column if not exists hidden         boolean not null default false;
alter table public.questions       add column if not exists hidden_reason  text;
alter table public.questions       add column if not exists hidden_by      uuid references public.profiles(id) on delete set null;
-- First teacher answer (for "avg time to first teacher answer" on Insights).
alter table public.questions       add column if not exists answered_at    timestamptz;
alter table public.answers         add column if not exists pending_review boolean not null default false;
alter table public.answers         add column if not exists hidden         boolean not null default false;
alter table public.answers         add column if not exists hidden_reason  text;
alter table public.answers         add column if not exists hidden_by      uuid references public.profiles(id) on delete set null;
alter table public.answers         add column if not exists upvotes        int not null default 0;
alter table public.answer_comments add column if not exists pending_review boolean not null default false;
alter table public.answer_comments add column if not exists hidden         boolean not null default false;
alter table public.answer_comments add column if not exists hidden_reason  text;

create table if not exists public.answer_votes (
  answer_id  uuid not null references public.answers(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (answer_id, user_id)
);

-- In-app bell: "Prof. Das answered your question", ticket status changes.
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,           -- 'answer' | 'best_answer' | 'comment' | 'ticket'
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
create index if not exists tickets_reporter_idx    on public.tickets (reporter_id, created_at desc);
create index if not exists tickets_dept_status_idx on public.tickets (department, status);
create index if not exists tickets_module_idx      on public.tickets (module, status, created_at desc);
create index if not exists tickets_dup_lookup_idx  on public.tickets (module, category, building, floor, created_at desc);
create index if not exists tickets_assigned_idx    on public.tickets (assigned_to);
create index if not exists tickets_room_idx        on public.tickets (module, building, room_no, category);
create index if not exists tickets_dup_of_idx      on public.tickets (duplicate_of);
create index if not exists ticket_events_ticket_idx on public.ticket_events (ticket_id, created_at);
create index if not exists ticket_followers_user_idx on public.ticket_followers (user_id);
create index if not exists escalations_open_idx    on public.escalations (status, target_role, created_at desc);
create unique index if not exists escalations_one_open_hotspot
  on public.escalations (hotspot_key, reason) where status = 'open' and hotspot_key is not null;
create unique index if not exists escalations_one_open_ticket
  on public.escalations (ticket_id, reason) where status = 'open' and ticket_id is not null;
create index if not exists questions_subject_idx   on public.questions (subject, created_at desc);
create index if not exists answers_question_idx    on public.answers (question_id, created_at);
create index if not exists answer_comments_answer_idx on public.answer_comments (answer_id, created_at);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- Email notifications: contact address on the profile (college domain, checked by the app),
-- a send log, and a once-only marker for escalation emails.
alter table public.profiles    add column if not exists email text;
create unique index if not exists profiles_email_key on public.profiles (lower(email));
alter table public.escalations add column if not exists emailed_at timestamptz;

create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  to_email    text not null,
  -- Set when a demo account's email was redirected to DEMO_NOTIFY_EMAIL.
  original_to text,
  template    text not null,
  ticket_id   uuid references public.tickets(id) on delete set null,
  status      text not null check (status in ('sent','failed')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_log_created_idx on public.email_log (created_at desc);

-- WhatsApp notifications (Twilio sandbox): phone + opt-in on the profile; the same log table
-- now holds both channels (to_email = email address or phone number; status gains 'skipped').
alter table public.profiles  add column if not exists phone text;
alter table public.profiles  add column if not exists whatsapp_optin boolean not null default false;
alter table public.email_log add column if not exists channel text not null default 'email';
alter table public.email_log drop constraint if exists email_log_status_check;
alter table public.email_log add constraint email_log_status_check check (status in ('sent','failed','skipped'));

-- Complaint moderation: one row per rephrase / privacy / block outcome (never the complaint text).
-- 3+ blocks in 24h put the person on the warden's dashboard flag list. No automatic bans.
create table if not exists public.moderation_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  roll_no    text,
  module     text not null,
  kind       text not null check (kind in ('text','photo')),
  level      text not null,
  reason     text,
  created_at timestamptz not null default now()
);
create index if not exists moderation_log_user_idx on public.moderation_log (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so RLS policies can read the caller's role)
-- ---------------------------------------------------------------------
create or replace function public.app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.app_department()
returns text language sql stable security definer set search_path = public as $$
  select department from public.profiles where id = auth.uid()
$$;

-- Can the current user see this ticket? (used by tickets/events policies)
-- Confidential safety reports: only the reporter, the Anti-Ragging Committee (arc) for
-- its own tickets, the ASSIGNED security officer, and the Dean. Nobody else, ever.
create or replace function public.can_view_ticket(
  p_id uuid, p_reporter uuid, p_department text, p_assigned uuid, p_module public.ticket_module)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_reporter = auth.uid() then true
    when public.app_role()::text = 'dean' then true
    when exists (select 1 from public.tickets t where t.id = p_id and t.is_confidential) then
      (public.app_role()::text = 'arc' and p_department = public.app_department())
      or (public.app_role()::text = 'security_officer' and p_assigned = auth.uid())
    else
      exists (select 1 from public.ticket_followers f where f.ticket_id = p_id and f.user_id = auth.uid())
      or (public.app_role()::text in ('staff','academic_office','security_officer','arc')
          and (p_department = public.app_department() or p_assigned = auth.uid()))
      or (public.app_role()::text = 'warden' and p_module::text = 'hostel')
      or (public.app_role()::text = 'hod' and p_module::text = 'academic')
  end
$$;

create or replace function public.can_manage_ticket(
  p_department text, p_assigned uuid, p_module public.ticket_module)
returns boolean language sql stable security definer set search_path = public as $$
  select
    (public.app_role()::text in ('staff','academic_office','security_officer','arc')
     and (p_department = public.app_department() or p_assigned = auth.uid()))
    or (public.app_role()::text = 'warden' and p_module::text = 'hostel')
$$;

-- New auth user -> profile row. Role/department come from app_metadata,
-- which only the service role can set (so students cannot make themselves staff).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, roll_no, role, department, hostel, wing, room)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'roll_no', ''),
    coalesce((new.raw_app_meta_data->>'role')::public.user_role, 'student'),
    nullif(new.raw_app_meta_data->>'department', ''),
    nullif(new.raw_user_meta_data->>'hostel', ''),
    nullif(new.raw_user_meta_data->>'wing', ''),
    nullif(new.raw_user_meta_data->>'room', '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tickets_touch_updated_at on public.tickets;
create trigger tickets_touch_updated_at
  before update on public.tickets
  for each row execute function public.touch_updated_at();

-- Keep questions.upvotes in sync with question_votes.
create or replace function public.sync_question_upvotes()
returns trigger language plpgsql security definer set search_path = public as $$
declare qid uuid := coalesce(new.question_id, old.question_id);
begin
  update public.questions
     set upvotes = (select count(*) from public.question_votes v where v.question_id = qid)
   where id = qid;
  return null;
end $$;

drop trigger if exists question_votes_sync on public.question_votes;
create trigger question_votes_sync
  after insert or delete on public.question_votes
  for each row execute function public.sync_question_upvotes();

-- Keep answers.upvotes in sync with answer_votes.
create or replace function public.sync_answer_upvotes()
returns trigger language plpgsql security definer set search_path = public as $$
declare aid uuid := coalesce(new.answer_id, old.answer_id);
begin
  update public.answers
     set upvotes = (select count(*) from public.answer_votes v where v.answer_id = aid)
   where id = aid;
  return null;
end $$;

drop trigger if exists answer_votes_sync on public.answer_votes;
create trigger answer_votes_sync
  after insert or delete on public.answer_votes
  for each row execute function public.sync_answer_upvotes();

-- Phase 5B: bell notification for the reporter (and "Me too" followers) whenever a
-- student-visible status change / merge / escalation is logged on their ticket.
create or replace function public.notify_ticket_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare t record; msg text;
begin
  if new.is_internal or new.type::text not in ('status_change','merged','escalated') then
    return null;
  end if;
  select id, ticket_no, title, reporter_id, is_confidential into t from public.tickets where id = new.ticket_id;
  if not found then return null; end if;
  msg := case new.type::text
    when 'status_change' then t.ticket_no || ' is now ' || coalesce(new.to_status::text, 'updated')
    when 'merged' then t.ticket_no || ' was merged with an earlier report'
    else t.ticket_no || ' was escalated for priority attention'
  end;
  insert into public.notifications (user_id, kind, title, body, link)
  -- Students track in /tickets, faculty (teacher / HOD / academic office reporters) in /reports.
  select r.uid, 'ticket', msg, t.title,
         case when p.role::text in ('teacher','hod','academic_office') then '/reports/' else '/tickets/' end || t.ticket_no
  from (
    select t.reporter_id as uid
    union
    select f.user_id from public.ticket_followers f where f.ticket_id = t.id and not t.is_confidential
  ) r
  left join public.profiles p on p.id = r.uid
  where r.uid is distinct from new.actor_id;
  return null;
end $$;

drop trigger if exists ticket_events_notify on public.ticket_events;
create trigger ticket_events_notify
  after insert on public.ticket_events
  for each row execute function public.notify_ticket_event();

-- Used by the seed script to restart ticket numbers at CC-1001.
create or replace function public.reset_ticket_seq()
returns void language sql security definer set search_path = public as $$
  select setval('public.ticket_no_seq', 1001, false)
$$;
revoke all on function public.reset_ticket_seq() from public, anon, authenticated;
grant execute on function public.reset_ticket_seq() to service_role;

-- Public-safe author info for Q&A (name + role only, never roll number).
-- Security officers get no student rows (so "Hide my name" reports can't be traced).
create or replace view public.public_profiles as
  select id, full_name, role from public.profiles
  where public.app_role()::text is distinct from 'security_officer' or role::text <> 'student';
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- All app writes go through server actions; RLS is the safety net.
-- ---------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.tickets          enable row level security;
alter table public.ticket_events    enable row level security;
alter table public.ticket_followers enable row level security;
alter table public.escalations      enable row level security;
alter table public.questions        enable row level security;
alter table public.answers          enable row level security;
alter table public.answer_comments  enable row level security;
alter table public.question_votes   enable row level security;
alter table public.hotspot_insights enable row level security;
alter table public.answer_votes     enable row level security;
alter table public.notifications    enable row level security;
alter table public.email_log        enable row level security;
alter table public.moderation_log   enable row level security;

-- profiles: everyone reads their own; non-students read all (to see roll numbers / staff lists).
drop policy if exists "profiles_select_own"   on public.profiles;
drop policy if exists "profiles_select_staff" on public.profiles;
drop policy if exists "profiles_update_own"   on public.profiles;
create policy "profiles_select_own"   on public.profiles for select to authenticated using (id = auth.uid());
-- Security officers can't read student profiles (identity of confidential reporters).
create policy "profiles_select_staff" on public.profiles for select to authenticated
  using (public.app_role() <> 'student' and (public.app_role()::text <> 'security_officer' or role::text <> 'student'));
-- Students may edit their room details only via the server (role/department are protected).

-- tickets
drop policy if exists "tickets_select" on public.tickets;
drop policy if exists "tickets_insert" on public.tickets;
drop policy if exists "tickets_update" on public.tickets;
create policy "tickets_select" on public.tickets for select to authenticated
  using (public.can_view_ticket(id, reporter_id, department, assigned_to, module));
create policy "tickets_insert" on public.tickets for insert to authenticated
  with check (reporter_id = auth.uid() and public.app_role()::text in ('student','teacher','hod','academic_office'));
create policy "tickets_update" on public.tickets for update to authenticated
  using (public.can_manage_ticket(department, assigned_to, module))
  with check (public.can_manage_ticket(department, assigned_to, module));

-- ticket_events: visible with the ticket; students don't see internal-only types.
drop policy if exists "events_select" on public.ticket_events;
drop policy if exists "events_insert" on public.ticket_events;
create policy "events_select" on public.ticket_events for select to authenticated
  using (
    exists (select 1 from public.tickets t where t.id = ticket_id and public.can_view_ticket(t.id, t.reporter_id, t.department, t.assigned_to, t.module))
    and (
      -- Staff see everything, except on tickets they reported themselves (faculty reporters).
      (public.app_role()::text not in ('student','teacher')
        and not exists (select 1 from public.tickets t where t.id = ticket_id and t.reporter_id = auth.uid()))
      or (type not in ('override','duplicate_flagged','duplicate_dismissed') and not is_internal)
    )
  );
create policy "events_insert" on public.ticket_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (select 1 from public.tickets t where t.id = ticket_id and public.can_view_ticket(t.id, t.reporter_id, t.department, t.assigned_to, t.module))
  );

-- ticket_followers ("Me too")
drop policy if exists "followers_select" on public.ticket_followers;
drop policy if exists "followers_insert" on public.ticket_followers;
drop policy if exists "followers_delete" on public.ticket_followers;
create policy "followers_select" on public.ticket_followers for select to authenticated
  using (user_id = auth.uid() or public.app_role()::text not in ('student','teacher'));
create policy "followers_insert" on public.ticket_followers for insert to authenticated
  with check (user_id = auth.uid());
create policy "followers_delete" on public.ticket_followers for delete to authenticated
  using (user_id = auth.uid());

-- escalations: dean sees all; hod academic; warden hostel. Dean/HOD acknowledge their own.
drop policy if exists "escalations_select" on public.escalations;
drop policy if exists "escalations_insert" on public.escalations;
drop policy if exists "escalations_update" on public.escalations;
create policy "escalations_select" on public.escalations for select to authenticated
  using (
    public.app_role() = 'dean'
    or (public.app_role() = 'hod' and module = 'academic')
    or (public.app_role() = 'warden' and module = 'hostel')
  );
create policy "escalations_insert" on public.escalations for insert to authenticated
  with check (
    (public.app_role() = 'warden' and module = 'hostel')
    or (public.app_role() = 'hod' and module = 'academic')
  );
create policy "escalations_update" on public.escalations for update to authenticated
  using (
    (public.app_role() = 'dean' and target_role = 'dean')
    or (public.app_role() = 'hod' and target_role = 'hod')
  );

-- hotspot_insights: read by admins; written only by the server (service role).
drop policy if exists "hotspot_insights_select" on public.hotspot_insights;
create policy "hotspot_insights_select" on public.hotspot_insights for select to authenticated
  using (public.app_role() in ('warden','dean','hod'));

-- Q&A: every signed-in user can read; authors write their own.
drop policy if exists "questions_select" on public.questions;
drop policy if exists "questions_insert" on public.questions;
drop policy if exists "questions_update" on public.questions;
-- Posts hidden by a teacher stay visible to their author and to teachers/admins only.
create policy "questions_select" on public.questions for select to authenticated
  using (not hidden or author_id = auth.uid() or public.app_role()::text in ('teacher','academic_office','hod','dean'));
create policy "questions_insert" on public.questions for insert to authenticated with check (author_id = auth.uid());
create policy "questions_update" on public.questions for update to authenticated using (author_id = auth.uid());

drop policy if exists "answers_select" on public.answers;
drop policy if exists "answers_insert" on public.answers;
-- Posts hidden by a teacher stay visible to their author and to teachers/admins only.
create policy "answers_select" on public.answers for select to authenticated
  using (not hidden or author_id = auth.uid() or public.app_role()::text in ('teacher','academic_office','hod','dean'));
create policy "answers_insert" on public.answers for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "answer_comments_select" on public.answer_comments;
drop policy if exists "answer_comments_insert" on public.answer_comments;
-- Posts hidden by a teacher stay visible to their author and to teachers/admins only.
create policy "answer_comments_select" on public.answer_comments for select to authenticated
  using (not hidden or author_id = auth.uid() or public.app_role()::text in ('teacher','academic_office','hod','dean'));
create policy "answer_comments_insert" on public.answer_comments for insert to authenticated with check (author_id = auth.uid());

drop policy if exists "votes_select" on public.question_votes;
drop policy if exists "votes_insert" on public.question_votes;
drop policy if exists "votes_delete" on public.question_votes;
create policy "votes_select" on public.question_votes for select to authenticated using (true);
create policy "votes_insert" on public.question_votes for insert to authenticated with check (user_id = auth.uid());
create policy "votes_delete" on public.question_votes for delete to authenticated using (user_id = auth.uid());

drop policy if exists "answer_votes_select" on public.answer_votes;
drop policy if exists "answer_votes_insert" on public.answer_votes;
drop policy if exists "answer_votes_delete" on public.answer_votes;
create policy "answer_votes_select" on public.answer_votes for select to authenticated using (true);
create policy "answer_votes_insert" on public.answer_votes for insert to authenticated with check (user_id = auth.uid());
create policy "answer_votes_delete" on public.answer_votes for delete to authenticated using (user_id = auth.uid());

-- notifications: each user reads / marks read only their own (rows are written by the server).
drop policy if exists "notifications_select" on public.notifications;
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_select" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications_update" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- email_log: the warden and the Dean read it; rows are written by the server (service role).
drop policy if exists "email_log_select" on public.email_log;
create policy "email_log_select" on public.email_log for select to authenticated
  using (public.app_role()::text in ('warden','dean'));

-- moderation_log: only the warden reads it; rows are written by the server (service role).
drop policy if exists "moderation_log_select" on public.moderation_log;
create policy "moderation_log_select" on public.moderation_log for select to authenticated
  using (public.app_role()::text = 'warden');

-- ---------------------------------------------------------------------
-- Realtime (live ticket timelines). RLS still applies to subscribers.
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.tickets;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.ticket_events;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Storage: complaint-photos bucket
-- Public read (file names are random UUIDs); uploads only into your own folder.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-photos', 'complaint-photos', true, 5242880,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "complaint_photos_read"   on storage.objects;
drop policy if exists "complaint_photos_upload" on storage.objects;
drop policy if exists "complaint_photos_delete" on storage.objects;
create policy "complaint_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'complaint-photos');
create policy "complaint_photos_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "complaint_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'complaint-photos' and (storage.foldername(name))[1] = auth.uid()::text);
