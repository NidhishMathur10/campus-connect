"use client";

import { useEffect, useState, useTransition } from "react";
import { BellOff, BellRing, Download, Loader2, Share, SquarePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canPromptInstall,
  captureInstallPrompt,
  disablePush,
  enablePush,
  isIos,
  isStandalone,
  onInstallChange,
  promptInstall,
  readPushState,
  registerServiceWorker,
  type PushState,
} from "./push-client";

type Lang = "en" | "hi";

const TEXT = {
  en: {
    install: "Install app",
    installHelp: "Put CampusConnect on your phone's home screen so it opens like an app.",
    installed: "Installed ✓",
    iosTitle: "Add to Home Screen",
    iosSteps: ["Tap the Share button in Safari", "Scroll down and tap “Add to Home Screen”", "Tap Add, then open CampusConnect from your Home Screen"],
    got: "Got it",
    alertsStaff: "Turn on job alerts",
    alertsStudent: "Get updates on this phone",
    alertsOn: "Alerts are ON",
    alertsOnStudent: "Updates on this phone: ON",
    turnOff: "Turn off",
    on: "On",
    off: "Off",
    blocked: "Blocked in browser settings",
    stateLabel: "Status",
    helpOffStaff: "Get a notification on this phone the moment a new job is assigned to you.",
    helpOffStudent: "Get a notification on this phone when your ticket is assigned, started or fixed.",
    helpOn: "This phone will buzz for new updates. Tap the notification to open the job.",
    helpBlocked: "You blocked notifications. Open your browser's Site settings for this website, set Notifications to Allow, then come back and tap the button.",
    helpNeedsInstall: "On iPhone, alerts only work after you add CampusConnect to your Home Screen (iOS 16.4 or newer). Install it first, then open it from the Home Screen.",
    helpUnsupported: "This browser cannot show phone alerts. Try Chrome on Android, or Safari with the app added to your Home Screen.",
    helpNotConfigured: "Phone alerts are not set up on the server yet. Please tell the admin.",
    enabledToast: "Alerts are on ✓",
    disabledToast: "Alerts are off",
  },
  hi: {
    install: "ऐप इंस्टॉल करें",
    installHelp: "CampusConnect को फ़ोन की होम स्क्रीन पर रखें, ताकि यह ऐप की तरह खुले।",
    installed: "इंस्टॉल हो गया ✓",
    iosTitle: "होम स्क्रीन पर जोड़ें",
    iosSteps: ["Safari में Share बटन दबाएँ", "नीचे जाकर “Add to Home Screen” दबाएँ", "Add दबाएँ, फिर होम स्क्रीन से CampusConnect खोलें"],
    got: "ठीक है",
    alertsStaff: "काम के अलर्ट चालू करें",
    alertsStudent: "इस फ़ोन पर अपडेट पाएँ",
    alertsOn: "अलर्ट चालू हैं",
    alertsOnStudent: "इस फ़ोन पर अपडेट: चालू",
    turnOff: "बंद करें",
    on: "चालू",
    off: "बंद",
    blocked: "ब्राउज़र सेटिंग में ब्लॉक है",
    stateLabel: "स्थिति",
    helpOffStaff: "नया काम मिलते ही इस फ़ोन पर सूचना पाएँ।",
    helpOffStudent: "टिकट असाइन, शुरू या ठीक होने पर इस फ़ोन पर सूचना पाएँ।",
    helpOn: "नए अपडेट पर यह फ़ोन बजेगा। सूचना दबाकर काम खोलें।",
    helpBlocked: "आपने सूचनाएँ ब्लॉक की हैं। ब्राउज़र की Site settings में इस वेबसाइट के लिए Notifications को Allow करें, फिर वापस आकर बटन दबाएँ।",
    helpNeedsInstall: "iPhone पर अलर्ट तभी चलते हैं जब CampusConnect होम स्क्रीन पर जुड़ा हो (iOS 16.4 या नया)। पहले इंस्टॉल करें, फिर होम स्क्रीन से खोलें।",
    helpUnsupported: "यह ब्राउज़र फ़ोन अलर्ट नहीं दिखा सकता। Android पर Chrome आज़माएँ।",
    helpNotConfigured: "सर्वर पर फ़ोन अलर्ट अभी सेट नहीं हैं। कृपया एडमिन को बताएँ।",
    enabledToast: "अलर्ट चालू ✓",
    disabledToast: "अलर्ट बंद",
  },
} as const;

/** Mounted once in the root layout: registers the service worker and catches the Android install prompt. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    captureInstallPrompt();
    void registerServiceWorker();
  }, []);
  return null;
}

/** "Install app" button (Android / desktop Chrome) or "Add to Home Screen" steps (iPhone). Hidden once installed. */
export function InstallApp({ lang = "en", className }: { lang?: Lang; className?: string }) {
  const t = TEXT[lang];
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const sync = () => {
      if (isStandalone()) return setMode("hidden");
      if (canPromptInstall()) return setMode("prompt");
      setMode(isIos() ? "ios" : "hidden");
    };
    sync();
    return onInstallChange(sync);
  }, []);

  if (mode === "hidden") return null;

  return (
    <div className={cn("rounded-3xl border border-info-fg/20 bg-info-bg p-4 text-info-fg", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-semibold">{t.installHelp}</p>
        {mode === "prompt" ? (
          <Button type="button" className="h-11 rounded-full px-5 text-base font-bold" onClick={() => void promptInstall()}>
            <Download className="size-5" /> {t.install}
          </Button>
        ) : (
          <Button type="button" className="h-11 rounded-full px-5 text-base font-bold" onClick={() => setShowSteps((v) => !v)}>
            <Share className="size-5" /> {t.install}
          </Button>
        )}
      </div>
      {mode === "ios" && showSteps && (
        <div className="mt-3 rounded-2xl bg-surface p-4 text-text">
          <p className="mb-2 flex items-center gap-2 text-sm font-extrabold">
            <SquarePlus className="size-4" /> {t.iosTitle}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm font-medium">
            {t.iosSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

/** "Turn on job alerts" (staff) / "Get updates on this phone" (everyone else) with the current state and help text. */
export function PushToggle({ audience = "staff", lang = "en", className }: { audience?: "staff" | "student"; lang?: Lang; className?: string }) {
  const t = TEXT[lang];
  const [state, setState] = useState<PushState>("checking");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    void readPushState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  function turnOn() {
    startTransition(async () => {
      const res = await enablePush();
      setState(res.state);
      if (res.error) toast.error(res.error);
      else if (res.state === "on") toast.success(t.enabledToast);
    });
  }

  function turnOff() {
    startTransition(async () => {
      const res = await disablePush();
      setState(res.state);
      if (res.error) toast.error(res.error);
      else toast.success(t.disabledToast);
    });
  }

  const help = {
    checking: "",
    unsupported: t.helpUnsupported,
    "needs-install": t.helpNeedsInstall,
    "not-configured": t.helpNotConfigured,
    blocked: t.helpBlocked,
    off: audience === "staff" ? t.helpOffStaff : t.helpOffStudent,
    on: t.helpOn,
  }[state];

  const badge =
    state === "on"
      ? { label: t.on, cls: "bg-success-bg text-success-fg" }
      : state === "blocked"
        ? { label: t.blocked, cls: "bg-danger-bg text-danger-fg" }
        : state === "off"
          ? { label: t.off, cls: "bg-neutral-bg text-neutral-fg" }
          : null;

  return (
    <div className={cn("rounded-3xl border border-border bg-surface p-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {state === "on" ? <BellRing className="size-5 shrink-0 text-success-fg" /> : <BellOff className="size-5 shrink-0 text-text-muted" />}
          <p className="text-base font-extrabold text-text">
            {state === "on" ? (audience === "staff" ? t.alertsOn : t.alertsOnStudent) : audience === "staff" ? t.alertsStaff : t.alertsStudent}
          </p>
          {badge && <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", badge.cls)}>{badge.label}</span>}
        </div>
        {state === "off" && (
          <Button type="button" onClick={turnOn} disabled={pending} className="h-11 rounded-full px-5 text-base font-bold">
            {pending ? <Loader2 className="size-5 animate-spin" /> : <BellRing className="size-5" />}
            {audience === "staff" ? t.alertsStaff : t.alertsStudent}
          </Button>
        )}
        {state === "on" && (
          <Button type="button" variant="outline" onClick={turnOff} disabled={pending} className="h-11 rounded-full px-5 text-base font-bold">
            {pending && <Loader2 className="size-5 animate-spin" />} {t.turnOff}
          </Button>
        )}
      </div>
      {help && <p className="mt-2 text-sm font-medium text-text-muted">{help}</p>}
    </div>
  );
}
