import Link from "next/link";
import { ArrowRight, Building2, GraduationCap, Lock, PackageSearch, Search, ShieldCheck, Ticket } from "lucide-react";
import { TrackBox } from "@/components/tickets/track-box";
import { LandingPage } from "@/components/landing/landing-page";
import { getCurrentProfile, requireProfile } from "@/lib/auth";
import { COLLEGE_NAME } from "@/config/college";
import { CATEGORY_STYLES } from "@/config/styles";
import { HOSTEL_CATEGORIES, ACADEMIC_CATEGORIES } from "@/config/routing";

export default async function StudentHome() {
  // Signed-out visitors get the public landing page; everyone else goes to their role home.
  const { userId } = await getCurrentProfile();
  if (!userId) return <LandingPage />;
  const profile = await requireProfile(["student"]);
  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="animate-slide-up space-y-2">
        <p className="eyebrow">{COLLEGE_NAME}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-5xl">
          Hi {firstName}, what needs fixing?
        </h1>
        <p className="max-w-2xl text-text-muted">
          Describe the problem in your own words — English or Hindi. We&apos;ll turn it into a
          ticket, send it to the right team, and keep you updated.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {/* Hostel & Campus — navy hero card */}
        <Link
          href="/hostel"
          className="group relative flex min-h-72 animate-slide-up flex-col overflow-hidden rounded-3xl bg-surface-inverse p-7 text-text-inverse shadow-xl transition-transform hover:-translate-y-1"
        >
          <div className="absolute -top-16 -right-16 size-56 rounded-full border-[28px] border-accent-blue/25" />
          <div className="relative grid size-14 place-items-center rounded-2xl bg-text-inverse/10">
            <Building2 className="size-7" />
          </div>
          <p className="eyebrow relative mt-6 text-info-on-inverse">Module 1</p>
          <h2 className="relative mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Hostel &amp; Campus</h2>
          <p className="relative mt-2 max-w-sm text-sm text-text-inverse-muted">
            Plumbing, electricity, Wi-Fi, laundry, mess food, rooms, gym and sports.
          </p>
          <div className="relative mt-auto flex flex-wrap gap-1.5 pt-6">
            {HOSTEL_CATEGORIES.slice(0, 6).map((c) => {
              const Icon = CATEGORY_STYLES[c].icon;
              return (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-text-inverse/10 px-2.5 py-1 text-xs font-semibold">
                  <Icon className="size-3" /> {c}
                </span>
              );
            })}
          </div>
          <span className="absolute right-6 bottom-6 grid size-11 place-items-center rounded-full bg-surface text-text transition-transform group-hover:translate-x-1">
            <ArrowRight className="size-5" />
          </span>
        </Link>

        {/* Education — sky card */}
        <Link
          href="/education"
          className="group relative flex min-h-72 animate-slide-up flex-col overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface-accent to-surface-accent-2 p-7 shadow-xl transition-transform [animation-delay:80ms] hover:-translate-y-1"
        >
          <div className="absolute -right-16 -bottom-16 size-56 rounded-full border-[28px] border-accent-violet/15" />
          <div className="relative grid size-14 place-items-center rounded-2xl bg-primary text-primary-fg">
            <GraduationCap className="size-7" />
          </div>
          <p className="eyebrow relative mt-6 text-accent-violet-text">Module 2</p>
          <h2 className="relative mt-1 text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Education</h2>
          <p className="relative mt-2 max-w-sm text-sm text-text-muted">
            Report classroom, lab, library or academic-office issues — and ask doubts on the open Q&amp;A board.
          </p>
          <div className="relative mt-auto flex flex-wrap gap-1.5 pt-6">
            {ACADEMIC_CATEGORIES.slice(0, 4).map((c) => {
              const Icon = CATEGORY_STYLES[c].icon;
              return (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-text">
                  <Icon className="size-3" /> {c}
                </span>
              );
            })}
          </div>
          <span className="absolute right-6 bottom-6 grid size-11 place-items-center rounded-full bg-primary text-primary-fg transition-transform group-hover:translate-x-1">
            <ArrowRight className="size-5" />
          </span>
        </Link>

        {/* Safety & Security — calm white card with a rose accent */}
        <Link
          href="/safety"
          className="group relative flex min-h-72 animate-slide-up flex-col overflow-hidden rounded-3xl border border-danger-fg/30 bg-surface p-7 shadow-xl transition-transform [animation-delay:160ms] hover:-translate-y-1 md:col-span-2 xl:col-span-1"
        >
          <div className="absolute -top-16 -right-16 size-56 rounded-full border-[28px] border-danger-fg/30" />
          <div className="relative grid size-14 place-items-center rounded-2xl bg-danger-solid text-danger-solid-fg">
            <ShieldCheck className="size-7" />
          </div>
          <p className="eyebrow relative mt-6 text-danger-fg">Module 3</p>
          <h2 className="relative mt-1 text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Safety &amp; Security</h2>
          <p className="relative mt-2 max-w-sm text-sm text-text-muted">
            Ragging, harassment, threats, theft or a suspicious person — tell us safely.
          </p>
          <p className="relative mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger-fg">
            <Lock className="size-3.5" /> Your report is confidential
          </p>
          <span className="absolute right-6 bottom-6 grid size-11 place-items-center rounded-full bg-danger-solid text-danger-solid-fg transition-transform group-hover:translate-x-1">
            <ArrowRight className="size-5" />
          </span>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/tickets" className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-5 transition-colors hover:border-accent-blue">
          <span className="grid size-11 place-items-center rounded-2xl bg-surface-accent text-accent-text"><Ticket className="size-5" /></span>
          <span>
            <span className="block font-bold text-text">My tickets</span>
            <span className="block text-sm text-text-muted">See progress on everything you reported</span>
          </span>
        </Link>
        <div className="space-y-3 rounded-3xl border border-border bg-surface p-5">
          <span className="flex items-center gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-surface-accent text-accent-text"><Search className="size-5" /></span>
            <span>
              <span className="block font-bold text-text">Track by ticket number</span>
              <span className="block text-sm text-text-muted">Got a number like CC-1004? Look it up</span>
            </span>
          </span>
          <TrackBox />
        </div>
        <Link href="/lost-found" className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-5 transition-colors hover:border-accent-blue sm:col-span-2">
          <span className="grid size-11 place-items-center rounded-2xl bg-surface-accent text-accent-text"><PackageSearch className="size-5" /></span>
          <span>
            <span className="block font-bold text-text">Lost &amp; Found</span>
            <span className="block text-sm text-text-muted">Lost your earbuds, ID card or bottle? Post it or find what others handed in — we match them for you</span>
          </span>
        </Link>
      </div>
    </div>
  );
}
