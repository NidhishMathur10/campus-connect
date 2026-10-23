import { Copy, Languages, ScanSearch, Ticket, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { COLLEGE_NAME } from "@/config/college";

const HIGHLIGHTS: { icon: LucideIcon; text: string }[] = [
  { icon: ScanSearch, text: "AI checks your photo matches the complaint" },
  { icon: Languages, text: "Ask in Hindi or English" },
  { icon: Copy, text: "Duplicate reports merged — everyone gets updates" },
  { icon: Ticket, text: "Track any ticket live" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      {/* Brand panel (laptop) */}
      <aside className="relative hidden overflow-hidden bg-navy p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -top-24 -right-24 size-96 rounded-full border-[40px] border-accent-blue/20" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full border-[40px] border-accent-violet/20" />
        <div className="relative inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2">
          <Logo />
        </div>
        <div className="relative my-auto w-full max-w-xl space-y-6 py-10">
          <p className="eyebrow text-sky-300">{COLLEGE_NAME}</p>
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight xl:text-5xl">
            Say what&apos;s wrong in your own words. We&apos;ll make it a ticket.
          </h2>
          <p className="text-slate-300">
            Hindi or English, with a photo or without — Gemini turns your complaint into a clear,
            routed, trackable ticket.
          </p>
          <ul className="space-y-3 pt-2">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10">
                  <Icon className="size-4 text-sky-300" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-col items-center px-4 py-8 sm:px-8 sm:py-12">
        <div className="mb-8 lg:hidden">
          <Logo />
        </div>
        <div className="w-full max-w-lg animate-slide-up">{children}</div>
      </main>
    </div>
  );
}
