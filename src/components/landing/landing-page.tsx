import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Copy,
  GitMerge,
  GraduationCap,
  Languages,
  Lock,
  Mail,
  PackageSearch,
  ScanSearch,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCog,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PublicTrackCard } from "@/components/tickets/public-track-card";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { COLLEGE_NAME } from "@/config/college";
import { CountUp } from "./count-up";
import { AnimatedWords, HeroBackdrop } from "./hero-fx";
import { Reveal } from "./reveal";
import { StepsDemo } from "./steps-demo";
import { TiltCard } from "./tilt-card";

// Demo numbers for the landing page only — static, not live data.
const STATS: { to: number; decimals?: number; suffix: string; label: string }[] = [
  { to: 12480, suffix: "+", label: "Tickets resolved" },
  { to: 6.4, decimals: 1, suffix: " hrs", label: "Avg fix time" },
  { to: 8200, suffix: "+", label: "Students helped" },
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
  { icon: PackageSearch, title: "Lost & Found", text: "AI matches what students lost with what others found, photos included." },
  { icon: ShieldCheck, title: "Safe claiming", text: "Owners prove it is theirs and collect from the Security Office. Valuables stay hidden." },
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
        <HeroBackdrop>
          <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 text-center sm:px-6 sm:pt-20 sm:pb-24">
            <p className="eyebrow animate-slide-up">{COLLEGE_NAME} · CampusConnect</p>
            <h1 className="mx-auto mt-4 max-w-4xl text-4xl leading-[1.1] font-extrabold tracking-tight text-text sm:text-6xl">
              <AnimatedWords text="Every campus complaint, tracked to resolution" />
            </h1>
            <p className="mx-auto mt-5 max-w-2xl animate-slide-up text-base text-text-muted [animation-delay:700ms] sm:text-lg">
              Say what&apos;s wrong in your own words — Hindi or English, with or without a photo. AI turns it into a
              clear ticket, sends it to the right team and keeps you updated until it&apos;s fixed.
            </p>
            <div className="mt-8 flex animate-slide-up flex-col justify-center gap-3 [animation-delay:800ms] sm:flex-row">
              <Button asChild size="lg"><Link href="/signup">Sign up <ArrowRight /></Link></Button>
              <Button asChild size="lg" variant="outline"><Link href="/login">Log in</Link></Button>
            </div>
          </div>
        </HeroBackdrop>

        {/* Stats (demo numbers) */}
        <Reveal as="section" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-20">
          <dl className="grid gap-4 rounded-3xl border border-border bg-surface p-6 text-center shadow-sm sm:grid-cols-3 sm:p-8">
            {STATS.map(({ to, decimals, suffix, label }) => (
              <div key={label}>
                <dt className="eyebrow order-2">{label}</dt>
                <dd className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl"><CountUp to={to} decimals={decimals} suffix={suffix} /></dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-center text-xs text-text-muted">Sample figures for illustration.</p>
        </Reveal>

        {/* How it works */}
        <section aria-labelledby="how-title" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <p className="eyebrow text-center">How it works</p>
          <h2 id="how-title" className="mt-2 text-center text-2xl font-extrabold tracking-tight text-text sm:text-4xl">
            From a rough complaint to a fixed problem
          </h2>
          <StepsDemo />

          <Reveal className="mt-6 rounded-3xl border border-warning-fg/30 bg-warning-bg p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-warning-solid text-warning-solid-fg">
                <PackageSearch className="size-6" />
              </span>
              <div>
                <p className="eyebrow text-warning-fg">Lost &amp; Found</p>
                <h3 className="text-lg font-extrabold text-text">Lost your earbuds? Found someone&apos;s ID card?</h3>
              </div>
            </div>
            <ol className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["1. Post it", "Describe what you lost or found, with a photo if you can."],
                ["2. AI matches", "Gemini compares it with the other side and tells both people."],
                ["3. Claim it", "The owner answers a question only they could know."],
                ["4. Collect", "The Security Officer verifies and hands it over at the office."],
              ].map(([t, d]) => (
                <li key={t} className="rounded-2xl bg-surface p-4">
                  <p className="font-bold text-text">{t}</p>
                  <p className="mt-0.5 text-text-muted">{d}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* Features */}
        <section aria-labelledby="features-title" className="bg-surface-inverse py-16 text-text-inverse sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="eyebrow text-center text-info-on-inverse">Built for the whole campus</p>
            <h2 id="features-title" className="mt-2 text-center text-2xl font-extrabold tracking-tight sm:text-4xl">
              Everything a complaint needs
            </h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, text }, i) => (
                <Reveal as="li" key={title} delay={(i % 4) * 80}>
                <TiltCard className="h-full rounded-3xl border border-text-inverse/15 bg-text-inverse/5 p-5 hover:bg-text-inverse/10">
                  <span className="grid size-10 place-items-center rounded-2xl bg-text-inverse/10">
                    <Icon className="size-5 text-info-on-inverse" />
                  </span>
                  <h3 className="mt-4 font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-text-inverse-muted">{text}</p>
                </TiltCard>
                </Reveal>
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
