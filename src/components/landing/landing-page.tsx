import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BrainCircuit,
  Copy,
  FilePenLine,
  GitMerge,
  GraduationCap,
  Languages,
  Lock,
  Mail,
  Route,
  ScanSearch,
  ShieldAlert,
  Ticket,
  TrendingUp,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PublicTrackCard } from "@/components/tickets/public-track-card";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { COLLEGE_NAME } from "@/config/college";

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FilePenLine, title: "Report", text: "Describe the problem in your own words — add a photo and the place." },
  { icon: BrainCircuit, title: "AI understands", text: "Gemini reads it, asks only what's missing and writes a clear ticket." },
  { icon: Route, title: "Routed", text: "It lands with the right department at the right priority." },
  { icon: Ticket, title: "Tracked", text: "Follow every step live with your ticket number until it's fixed." },
];

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: ScanSearch, title: "Photo verification", text: "AI checks that your photo really shows the problem you described." },
  { icon: Languages, title: "Hindi + English", text: "Write in either language — tickets are always summarised in English." },
  { icon: Copy, title: "Duplicate detection + Me too", text: "Already reported? Join the existing ticket with one tap." },
  { icon: GitMerge, title: "Merge with shared updates", text: "Staff merge duplicates and everyone affected gets the same updates." },
  { icon: UserCog, title: "Faculty reporting", text: "Teachers and staff report classroom and lab issues the same way." },
  { icon: Lock, title: "Confidential Safety", text: "Ragging, harassment and threats reach only the right committee." },
  { icon: TrendingUp, title: "Auto-escalation", text: "Recurring, reopened and overdue issues go to the Dean or HOD." },
  { icon: GraduationCap, title: "Education Q&A", text: "An open board for doubts, answered by classmates and teachers." },
  { icon: BellRing, title: "Live tracking", text: "Status changes appear instantly on every device." },
  { icon: Mail, title: "Email updates", text: "Get a mail when your ticket is assigned, in progress or resolved." },
];

/** Public home page for signed-out visitors. */
export function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full border border-border/80 bg-surface/90 py-2 pr-2 pl-4 shadow-float backdrop-blur"
        >
          <Link href="/" aria-label="CampusConnect home"><Logo /></Link>
          <div className="flex items-center gap-1.5">
            <ThemeToggle variant="auto" />
            <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href="/login">Log in</Link></Button>
            <Button asChild><Link href="/signup">Sign up</Link></Button>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-20 sm:pb-24">
          <p className="eyebrow animate-slide-up">{COLLEGE_NAME} · CampusConnect</p>
          <h1 className="mx-auto mt-4 max-w-4xl animate-slide-up text-4xl leading-[1.1] font-extrabold tracking-tight text-text [animation-delay:60ms] sm:text-6xl">
            Every campus complaint, tracked to resolution
          </h1>
          <p className="mx-auto mt-5 max-w-2xl animate-slide-up text-base text-text-muted [animation-delay:120ms] sm:text-lg">
            Say what&apos;s wrong in your own words — Hindi or English, with or without a photo. AI turns it into a
            clear ticket, sends it to the right team and keeps you updated until it&apos;s fixed.
          </p>
          <div className="mt-8 flex animate-slide-up flex-col justify-center gap-3 [animation-delay:180ms] sm:flex-row">
            <Button asChild size="lg"><Link href="/signup">Sign up <ArrowRight /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link href="/login">Log in</Link></Button>
          </div>
        </section>

        {/* How it works */}
        <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <p className="eyebrow text-center">How it works</p>
          <h2 id="how-title" className="mt-2 text-center text-2xl font-extrabold tracking-tight text-text sm:text-4xl">
            From a rough complaint to a fixed problem
          </h2>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <li
                key={title}
                className="relative animate-slide-up rounded-3xl border border-border bg-surface p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-accent-blue hover:shadow-md"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span className="absolute top-5 right-6 text-4xl font-extrabold text-border" aria-hidden="true">{i + 1}</span>
                <span className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-fg">
                  <Icon className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-text">{title}</h3>
                <p className="mt-1 text-sm text-text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section aria-labelledby="features-title" className="bg-surface-inverse py-16 text-text-inverse sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="eyebrow text-center text-info-on-inverse">Built for the whole campus</p>
            <h2 id="features-title" className="mt-2 text-center text-2xl font-extrabold tracking-tight sm:text-4xl">
              Everything a complaint needs
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="rounded-3xl border border-text-inverse/15 bg-text-inverse/5 p-5 transition-colors hover:bg-text-inverse/10">
                  <span className="grid size-10 place-items-center rounded-2xl bg-text-inverse/10">
                    <Icon className="size-5 text-info-on-inverse" />
                  </span>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-text-inverse-muted">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Track */}
        <section aria-labelledby="track-title" className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
          <h2 id="track-title" className="sr-only">Track a ticket</h2>
          <PublicTrackCard />
        </section>

        {/* Final call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-accent to-surface-accent-2 p-8 text-center shadow-sm sm:p-12">
            <ShieldAlert className="mx-auto size-8 text-accent-text" aria-hidden="true" />
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-text sm:text-3xl">Ready to get it fixed?</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-text-muted">Sign up with your roll number — it takes under a minute.</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Button asChild size="lg"><Link href="/signup">Sign up</Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/login">Log in</Link></Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-4 py-8 text-center text-sm text-text-muted">
        <Logo className="justify-center" />
        <p className="mt-2">{COLLEGE_NAME} · Every campus complaint, tracked to resolution.</p>
      </footer>
    </div>
  );
}
