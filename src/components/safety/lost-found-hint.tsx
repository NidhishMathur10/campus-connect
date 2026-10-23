import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown on a Safety report categorised "Theft / Lost item": many "thefts" are just misplaced things,
 * and Lost & Found can match them with what others have found. Pre-fills the lost-item form.
 */
export function LostFoundHint({ text, building, spot }: { text: string; building: string | null; spot: string | null }) {
  const params = new URLSearchParams({ type: "lost", text: text.slice(0, 1500) });
  if (building) params.set("building", building);
  if (spot) params.set("spot", spot);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface-accent p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-fg">
        <PackageSearch className="size-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm font-semibold text-text">
        Lost something rather than stolen?
        <span className="block font-normal text-text-muted">Post it in Lost &amp; Found — we&apos;ll match it with items people hand in. Your safety report is not affected.</span>
      </p>
      <Button asChild variant="outline">
        <Link href={`/lost-found/report?${params.toString()}`}>Post it in Lost &amp; Found</Link>
      </Button>
    </div>
  );
}
