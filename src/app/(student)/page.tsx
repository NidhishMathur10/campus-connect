import Link from "next/link";
import { ArrowRight, Building2, GraduationCap, Lock, Search, ShieldCheck, Ticket } from "lucide-react";
import { TrackBox } from "@/components/tickets/track-box";
import { requireProfile } from "@/lib/auth";
import { COLLEGE_NAME } from "@/config/college";
import { CATEGORY_STYLES } from "@/config/styles";
import { HOSTEL_CATEGORIES, ACADEMIC_CATEGORIES } from "@/config/routing";

export default async function StudentHome() {
  const profile = await requireProfile(["student"]);
  const firstName = profile.full_name.split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="animate-slide-up space-y-2">
        <p className="eyebrow">{COLLEGE_NAME}</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-navy sm:text-5xl">
          Hi {firstName}, what needs fixing?
        </h1>
        <p className="max-w-2xl text-slate-600">
          Describe the problem in your own words — English or Hindi. We&apos;ll turn it into a
          ticket, send it to the right team, and keep you updated.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {/* Hostel & Campus — navy hero card */}
        <Link
          href="/hostel"
          className="group relative flex min-h-72 animate-slide-up flex-col overflow-hidden rounded-3xl bg-navy p-7 text-white shadow-xl shadow-slate-900/10 transition-transform hover:-translate-y-1"
        >
          <div className="absolute -top-16 -right-16 size-56 rounded-full border-[28px] border-accent-blue/25" />
          <div className="relative grid size-14 place-items-center rounded-2xl bg-white/10">
            <Building2 className="size-7" />
          </div>
          <p className="eyebrow relative mt-6 text-sky-300">Module 1</p>
          <h2 className="relative mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Hostel &amp; Campus</h2>
          <p className="relative mt-2 max-w-sm text-sm text-slate-300">
            Plumbing, electricity, Wi-Fi, laundry, mess food, rooms, gym and sports.
          </p>
          <div className="relative mt-auto flex flex-wrap gap-1.5 pt-6">
            {HOSTEL_CATEGORIES.slice(0, 6).map((c) => {
              const Icon = CATEGORY_STYLES[c].icon;
              return (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
                  <Icon className="size-3" /> {c}
                </span>
              );
            })}
          </div>
          <span className="absolute right-6 bottom-6 grid size-11 place-items-center rounded-full bg-white text-navy transition-transform group-hover:translate-x-1">
            <ArrowRight className="size-5" />
          </span>
        </Link>

        {/* Education — sky card */}
        <Link
          href="/education"
          className="group relative flex min-h-72 animate-slide-up flex-col overflow-hidden rounded-3xl border border-sky-tint-2 bg-gradient-to-br from-sky-tint to-sky-tint-2 p-7 shadow-xl shadow-blue-900/5 transition-transform [animation-delay:80ms] hover:-translate-y-1"
        >
          <div className="absolute -right-16 -bottom-16 size-56 rounded-full border-[28px] border-accent-violet/15" />
          <div className="relative grid size-14 place-items-center rounded-2xl bg-navy text-white">
            <GraduationCap className="size-7" />
          </div>
          <p className="eyebrow relative mt-6 text-accent-violet">Module 2</p>
          <h2 className="relative mt-1 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Education</h2>
          <p className="relative mt-2 max-w-sm text-sm text-slate-600">
            Report classroom, lab, library or academic-office issues — and ask doubts on the open Q&amp;A board.
          </p>
          <div className="relative mt-auto flex flex-wrap gap-1.5 pt-6">
            {ACADEMIC_CATEGORIES.slice(0, 4).map((c) => {
              const Icon = CATEGORY_STYLES[c].icon;
              return (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">
                  <Icon className="size-3" /> {c}
                </span>
              );
            })}
          </div>
          <span className="absolute right-6 bottom-6 grid size-11 place-items-center rounded-full bg-navy text-white transition-transform group-hover:translate-x-1">
            <ArrowRight className="size-5" />
          </span>
        </Link>

        {/* Safety & Security — calm white card with a rose accent */}
        <Link
          href="/safety"
          className="group relative flex min-h-72 animate-slide-up flex-col overflow-hidden rounded-3xl border border-rose-200 bg-white p-7 shadow-xl shadow-rose-900/5 transition-transform [animation-delay:160ms] hover:-translate-y-1 md:col-span-2 xl:col-span-1"
        >
          <div className="absolute -top-16 -right-16 size-56 rounded-full border-[28px] border-rose-200/50" />
          <div className="relative grid size-14 place-items-center rounded-2xl bg-rose-600 text-white">
            <ShieldCheck className="size-7" />
          </div>
          <p className="eyebrow relative mt-6 text-rose-600">Module 3</p>
          <h2 className="relative mt-1 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Safety &amp; Security</h2>
          <p className="relative mt-2 max-w-sm text-sm text-slate-600">
            Ragging, harassment, threats, theft or a suspicious person — tell us safely.
          </p>
          <p className="relative mt-auto inline-flex w-fit items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
            <Lock className="size-3.5" /> Your report is confidential
          </p>
          <span className="absolute right-6 bottom-6 grid size-11 place-items-center rounded-full bg-rose-600 text-white transition-transform group-hover:translate-x-1">
            <ArrowRight className="size-5" />
          </span>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/tickets" className="flex items-center gap-4 rounded-3xl border border-slate-200 bg-white p-5 transition-colors hover:border-accent-blue">
          <span className="grid size-11 place-items-center rounded-2xl bg-sky-tint text-accent-blue"><Ticket className="size-5" /></span>
          <span>
            <span className="block font-bold text-navy">My tickets</span>
            <span className="block text-sm text-slate-500">See progress on everything you reported</span>
          </span>
        </Link>
        <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5">
          <span className="flex items-center gap-4">
            <span className="grid size-11 place-items-center rounded-2xl bg-sky-tint text-accent-blue"><Search className="size-5" /></span>
            <span>
              <span className="block font-bold text-navy">Track by ticket number</span>
              <span className="block text-sm text-slate-500">Got a number like CC-1004? Look it up</span>
            </span>
          </span>
          <TrackBox />
        </div>
      </div>
    </div>
  );
}
