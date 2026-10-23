import Link from "next/link";
import { CalendarDays, Sparkles } from "lucide-react";
import type { PublicItem } from "@/lib/lost-found/types";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ItemPhoto, LfCategoryBadge, LfHeldBadge, LfStatusBadge, LfTypeBadge, PlaceLine } from "./item-bits";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

/** One listing card: title, category, place, date, status. Sensitive items carry a server-blurred photo. */
export function ItemCard({
  item,
  matchScore,
  showType = false,
  className,
}: {
  item: PublicItem;
  /** Set when this found item was matched with one of the viewer's lost reports. */
  matchScore?: number;
  showType?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/lost-found/${item.id}`}
      className={cn(
        "group flex animate-slide-up flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-blue hover:shadow-md",
        matchScore != null && "border-violet-fg/40",
        className,
      )}
    >
      <ItemPhoto src={item.photo_src} blurred={item.photo_blurred} category={item.item_category} alt={item.title} className="h-36 w-full" />
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          {showType && <LfTypeBadge type={item.type} />}
          <LfCategoryBadge category={item.item_category} />
          <LfStatusBadge status={item.status} />
        </div>
        <h3 className="line-clamp-2 text-base leading-snug font-bold text-text">{item.title}</h3>
        <PlaceLine building={item.building} spot={item.spot} />
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" />
            {item.type === "lost" ? "Lost" : "Found"} {dateFmt.format(new Date(item.happened_at))}
          </span>
          <span>{item.item_no} · {timeAgo(item.created_at)}</span>
        </div>
        {item.type === "found" && item.held_at && <LfHeldBadge heldAt={item.held_at} />}
        {matchScore != null && (
          <p className="inline-flex items-center gap-1.5 rounded-xl bg-violet-bg px-2.5 py-1.5 text-xs font-bold text-violet-fg">
            <Sparkles className="size-3.5" /> Possible match for your lost item
          </p>
        )}
      </div>
    </Link>
  );
}
