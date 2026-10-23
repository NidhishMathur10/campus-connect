import { Globe, Mail, Phone, PhoneCall, Siren } from "lucide-react";
import { ANTI_RAGGING_HELPLINE, CAMPUS_SECURITY_PHONE, NATIONAL_EMERGENCY, telHref } from "@/config/safety";
import { cn } from "@/lib/utils";

/** Always visible on the Safety report page; turns red when the AI detects immediate danger. */
export function EmergencyPanel({ emergency = false, className }: { emergency?: boolean; className?: string }) {
  const link = cn(
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors",
    emergency ? "bg-white text-[#b91c1c] hover:bg-[#fee2e2]" : "bg-navy text-white hover:bg-ink/90",
  );
  const sub = emergency ? "text-white/80" : "text-slate-500";

  return (
    <section
      role={emergency ? "alert" : "region"}
      aria-label="Emergency contacts"
      className={cn(
        "animate-fade-in space-y-4 rounded-3xl border p-5 shadow-sm transition-colors sm:p-6",
        emergency ? "border-red-700 bg-red-600 text-white shadow-red-900/20" : "border-rose-200 bg-rose-50 text-foreground",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", emergency ? "bg-white/15" : "bg-card")}>
          <Siren className={cn("size-5", emergency ? "animate-pulse text-white" : "text-rose-700")} />
        </span>
        <div>
          <p className="font-extrabold">
            {emergency ? "It sounds like you may be in danger right now." : "If you are in immediate danger"}
          </p>
          <p className={cn("text-sm", emergency ? "text-white/90" : "text-slate-600")}>
            {emergency
              ? "Please call for help now — your report is saved and the right people are being told."
              : "Call Campus Security or 112 first, then report here."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={telHref(CAMPUS_SECURITY_PHONE)} className={link}>
          <PhoneCall className="size-4" /> Campus Security · {CAMPUS_SECURITY_PHONE}
        </a>
        <a href={telHref(NATIONAL_EMERGENCY)} className={link}>
          <Phone className="size-4" /> Emergency · {NATIONAL_EMERGENCY}
        </a>
      </div>

      <div className={cn("space-y-1.5 border-t pt-3 text-sm", emergency ? "border-white/20" : "border-rose-200")}>
        <p className="font-bold">National Anti-Ragging Helpline · 24x7 · toll free</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-semibold">
          <a href={telHref(ANTI_RAGGING_HELPLINE.phone)} className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
            <Phone className="size-3.5" /> {ANTI_RAGGING_HELPLINE.phone}
          </a>
          <a href={`mailto:${ANTI_RAGGING_HELPLINE.email}`} className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline">
            <Mail className="size-3.5" /> {ANTI_RAGGING_HELPLINE.email}
          </a>
          <a
            href={`https://${ANTI_RAGGING_HELPLINE.website}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
          >
            <Globe className="size-3.5" /> {ANTI_RAGGING_HELPLINE.website}
          </a>
        </div>
        <p className={cn("text-xs", sub)}>Tap a number to call on your phone.</p>
      </div>
    </section>
  );
}
