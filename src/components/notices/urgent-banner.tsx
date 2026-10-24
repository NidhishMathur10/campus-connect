"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Loader2, Siren } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeNotice } from "@/lib/notices/actions";
import type { Notice } from "@/lib/types";
import { formatWhen } from "./notice-bits";

export interface BannerNotice extends Pick<Notice, "id" | "title" | "title_hi" | "summary" | "body" | "body_hi" | "created_at"> {
  href: string;
}

/** Red banner for urgent alerts, shown until the student taps "Got it" or the alert expires. */
export function UrgentBanner({ notices }: { notices: BannerNotice[] }) {
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = notices.filter((n) => !hidden.includes(n.id));
  if (visible.length === 0) return null;
  return (
    <div className="mb-6 space-y-3" role="alert">
      {visible.map((n) => (
        <BannerItem key={n.id} notice={n} onDone={() => setHidden((h) => [...h, n.id])} />
      ))}
    </div>
  );
}

function BannerItem({ notice, onDone }: { notice: BannerNotice; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [hindi, setHindi] = useState(false);
  const canHindi = !!notice.body_hi;
  const title = hindi ? notice.title_hi || notice.title : notice.title;
  const text = hindi ? notice.body_hi! : notice.summary || notice.body;

  function gotIt() {
    start(async () => {
      const res = await acknowledgeNotice(notice.id);
      if (res.ok) onDone();
      else toast.error(res.error);
    });
  }

  return (
    <div className="animate-slide-up flex flex-col gap-3 rounded-3xl bg-danger-solid p-4 text-danger-solid-fg shadow-lg sm:flex-row sm:items-center sm:p-5">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-danger-solid-fg/15">
        <Siren className="size-6" />
      </span>
      <div className="min-w-0 flex-1" lang={hindi ? "hi" : "en"}>
        <p className="text-xs font-bold tracking-wider uppercase opacity-80">Urgent alert · {formatWhen(notice.created_at)}</p>
        <p className="text-lg leading-snug font-extrabold">{title}</p>
        <p className="line-clamp-3 text-sm opacity-90">{text}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canHindi && (
          <button type="button" onClick={() => setHindi((h) => !h)} className="rounded-full px-3 py-1.5 text-sm font-bold underline-offset-2 hover:underline">
            {hindi ? "English" : "हिन्दी"}
          </button>
        )}
        <Button variant="outline" asChild className="border-transparent bg-danger-solid-fg/15 text-danger-solid-fg hover:bg-danger-solid-fg/25 hover:text-danger-solid-fg">
          <Link href={notice.href}>Details</Link>
        </Button>
        <Button onClick={gotIt} disabled={pending} className="bg-danger-solid-fg text-danger-solid hover:bg-danger-solid-fg/90">
          {pending ? <Loader2 className="animate-spin" /> : <Check />} Got it
        </Button>
      </div>
    </div>
  );
}
