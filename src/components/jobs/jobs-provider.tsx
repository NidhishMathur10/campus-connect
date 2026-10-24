"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { getHindiTitles } from "@/lib/jobs/actions";
import type { JobTicket } from "@/lib/jobs/types";
import type { ActionResult } from "@/lib/tickets/actions";
import { LANG_COOKIE, TEXT, type Lang, type Text } from "./i18n";

/** What a pending action does to the card while its 5-second Undo window is open. */
export type JobPatch = Partial<JobTicket> | "gone";

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<ActionResult>;
}

interface JobsContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Text;
  now: number;
  /** Applies pending (not yet saved) changes to a ticket from the server; null = hide it. */
  applyPatch: (ticket: JobTicket) => JobTicket | null;
  /** Shows the friendly confirmation with Undo; the action itself runs when the 5 seconds are over. */
  schedule: (opts: { ticket: JobTicket; patch: JobPatch; message: string; run: () => Promise<ActionResult> }) => void;
  /** Call when fresh server data arrives: forgets patches that have been saved. */
  onServerData: () => void;
  hindiTitle: (ticket: JobTicket) => string | null;
  requestHindi: (tickets: JobTicket[]) => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export function useJobs(): JobsContextValue {
  const ctx = useContext(JobsContext);
  if (!ctx) throw new Error("useJobs must be used inside <JobsProvider>");
  return ctx;
}

const UNDO_MS = 5000;

export function JobsProvider({
  initialLang,
  initialNow,
  children,
}: {
  initialLang: Lang;
  initialNow: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [now, setNow] = useState(initialNow);
  const [patches, setPatches] = useState<Record<string, JobPatch>>({});
  const [hindi, setHindi] = useState<Record<string, string>>({});
  const pending = useRef(new Map<string, Pending>());
  const committed = useRef(new Set<string>());
  const asked = useRef(new Set<string>());
  const langRef = useRef(initialLang);
  useEffect(() => {
    langRef.current = lang;
  }, [lang]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // cookies blocked: the choice just won't be remembered
    }
  }, []);

  const clearPatch = useCallback((id: string) => {
    committed.current.delete(id);
    setPatches((p) => {
      if (!(id in p)) return p;
      const next = { ...p };
      delete next[id];
      return next;
    });
  }, []);

  const commit = useCallback(
    async (id: string) => {
      const entry = pending.current.get(id);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.current.delete(id);
      committed.current.add(id);
      let res: ActionResult;
      try {
        res = await entry.run();
      } catch {
        res = { ok: false, error: TEXT[langRef.current].failed };
      }
      if (!res.ok) {
        toast.error(res.error || TEXT[langRef.current].failed);
        clearPatch(id);
      }
      router.refresh();
    },
    [clearPatch, router],
  );

  const schedule = useCallback<JobsContextValue["schedule"]>(
    ({ ticket, patch, message, run }) => {
      // A second tap on the same job saves the first one straight away.
      if (pending.current.has(ticket.id)) void commit(ticket.id);
      setPatches((p) => ({ ...p, [ticket.id]: patch }));
      const timer = setTimeout(() => void commit(ticket.id), UNDO_MS);
      pending.current.set(ticket.id, { timer, run });
      toast.success(message, {
        duration: UNDO_MS,
        action: {
          label: TEXT[lang].undo,
          onClick: () => {
            const entry = pending.current.get(ticket.id);
            if (!entry) return;
            clearTimeout(entry.timer);
            pending.current.delete(ticket.id);
            clearPatch(ticket.id);
            toast(TEXT[lang].undone, { duration: 2000 });
          },
        },
      });
    },
    [clearPatch, commit, lang],
  );

  // Leaving the page (or closing the tab) must not lose an action that is still in its Undo window.
  useEffect(() => {
    const map = pending.current;
    const flush = () => {
      for (const id of [...map.keys()]) void commit(id);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [commit]);

  const onServerData = useCallback(() => {
    for (const id of [...committed.current]) clearPatch(id);
  }, [clearPatch]);

  const applyPatch = useCallback<JobsContextValue["applyPatch"]>(
    (ticket) => {
      const patch = patches[ticket.id];
      if (!patch) return ticket;
      if (patch === "gone") return null;
      return { ...ticket, ...patch };
    },
    [patches],
  );

  const requestHindi = useCallback((tickets: JobTicket[]) => {
    const ids = tickets.filter((t) => !t.confidential && !t.title_hi && !asked.current.has(t.id)).map((t) => t.id);
    if (ids.length === 0) return;
    ids.forEach((id) => asked.current.add(id));
    void getHindiTitles(ids).then((titles) => {
      if (Object.keys(titles).length) setHindi((h) => ({ ...h, ...titles }));
    });
  }, []);

  const hindiTitle = useCallback((t: JobTicket) => t.title_hi ?? hindi[t.id] ?? null, [hindi]);

  const value = useMemo<JobsContextValue>(
    () => ({ lang, setLang, t: TEXT[lang], now, applyPatch, schedule, onServerData, hindiTitle, requestHindi }),
    [lang, setLang, now, applyPatch, schedule, onServerData, hindiTitle, requestHindi],
  );

  return <JobsContext.Provider value={value}>{children}</JobsContext.Provider>;
}
