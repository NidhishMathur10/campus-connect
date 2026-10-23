import { Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { COLLEGE_NAME } from "@/config/college";

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
        <div className="relative mt-auto max-w-md space-y-5">
          <p className="eyebrow text-sky-300">{COLLEGE_NAME}</p>
          <h2 className="text-4xl leading-tight font-extrabold tracking-tight">
            Say what&apos;s wrong in your own words. We&apos;ll make it a ticket.
          </h2>
          <p className="text-slate-300">
            Hindi or English, with a photo or without — Gemini turns your complaint into a clear,
            routed, trackable ticket.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">
            <Sparkles className="size-4 text-sky-300" />
            Powered by Google Gemini
          </div>
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
