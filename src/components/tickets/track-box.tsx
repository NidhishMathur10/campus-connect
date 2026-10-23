"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normaliseTicketNo } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Track by ticket number" search box. Students go to /tickets/CC-xxxx, others to /track/CC-xxxx. */
export function TrackBox({ basePath = "/tickets", className }: { basePath?: string; className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const no = normaliseTicketNo(value);
    if (!no) {
      setError("Enter a ticket number like CC-1004.");
      return;
    }
    setError(null);
    router.push(`${basePath}/${no}`);
  }

  return (
    <form onSubmit={submit} className={cn("space-y-1.5", className)}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Track by ticket number, e.g. CC-1004"
            className="rounded-full pl-10"
            aria-label="Ticket number"
            aria-invalid={!!error || undefined}
          />
        </div>
        <Button type="submit">Track</Button>
      </div>
      {error && <p className="px-3 text-sm text-red-700">{error}</p>}
    </form>
  );
}
