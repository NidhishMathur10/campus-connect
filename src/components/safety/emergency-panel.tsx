import { Globe, Mail, Phone, PhoneCall, Siren } from "lucide-react";
import { ANTI_RAGGING_HELPLINE, CAMPUS_SECURITY_PHONE, NATIONAL_EMERGENCY, telHref } from "@/config/safety";
import { cn } from "@/lib/utils";

/** Always visible on the Safety report page; turns red when the AI detects immediate danger. */
export function EmergencyPanel({ emergency = false, className }: { emergency?: boolean; className?: string }) {
  const link = cn(
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors",
    emergency ? "bg-danger-solid-fg text-danger-solid hover:bg-danger-bg" : "bg-surface-inverse text-text-inverse hover:bg-surface-inverse/90",
  );
  const sub = emergency ? "text-danger-solid-fg/80" : "text-text-muted";

  return (
    <section
      role={emergency ? "alert" : "region"}
      aria-label="Emergency contacts"
      className={cn(
        "animate-fade-in space-y-4 rounded-3xl border p-5 shadow-sm transition-colors sm:p-6",
        emergency ? "border-danger-solid bg-danger-solid text-danger-solid-fg" : "border-danger-fg/30 bg-danger-bg text-text",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-2xl", emergency ? "bg-text-inverse/15" : "bg-surface")}>
          <Siren className={cn("size-5", emergency ? "animate-pulse text-danger-solid-fg" : "text-danger-fg")} />
        </span>
        <div>
          <p className="font-extrabold">
            {emergency ? "It sounds like you may be in danger right now." : "If you are in immediate danger"}
          </p>
          <p className={cn("text-sm", emergency ? "text-danger-solid-fg/90" : "text-text-muted")}>
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

      <div className={cn("space-y-1.5 border-t pt-3 text-sm", emergency ? "border-text-inverse/20" : "border-danger-fg/30")}>
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
