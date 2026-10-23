import {
  Backpack,
  BookOpen,
  CircleHelp,
  EyeOff,
  GlassWater,
  Headphones,
  IdCard,
  KeyRound,
  Laptop,
  MapPin,
  Shirt,
  Smartphone,
  Umbrella,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  LF_HELD_LABELS,
  LF_STATUS_LABELS,
  type LfCategory,
  type LfHeldAt,
  type LfStatus,
  type LfType,
} from "@/config/lost-found";
import { cn } from "@/lib/utils";

export const LF_CATEGORY_ICONS: Record<LfCategory, LucideIcon> = {
  Phone: Smartphone,
  Wallet: Wallet,
  "ID card": IdCard,
  Keys: KeyRound,
  Bottle: GlassWater,
  Earphones: Headphones,
  Bag: Backpack,
  Umbrella: Umbrella,
  Book: BookOpen,
  "Laptop / charger": Laptop,
  Clothing: Shirt,
  Other: CircleHelp,
};

const pill = "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

const STATUS_CLASS: Record<LfStatus, string> = {
  open: "bg-info-bg text-info-fg border-info-fg/30",
  matched: "bg-violet-bg text-violet-fg border-violet-fg/30",
  claimed: "bg-success-bg text-success-fg border-success-fg/30",
  returned: "bg-neutral-bg text-neutral-fg border-neutral-fg/30",
  expired: "bg-neutral-bg text-neutral-fg border-neutral-fg/30",
};

export function LfStatusBadge({ status, className }: { status: LfStatus; className?: string }) {
  return <span className={cn(pill, STATUS_CLASS[status], className)}>{LF_STATUS_LABELS[status]}</span>;
}

export function LfTypeBadge({ type, className }: { type: LfType; className?: string }) {
  return (
    <span
      className={cn(
        pill,
        type === "lost" ? "bg-warning-bg text-warning-fg border-warning-fg/30" : "bg-success-bg text-success-fg border-success-fg/30",
        className,
      )}
    >
      {type === "lost" ? "Lost" : "Found"}
    </span>
  );
}

export function LfCategoryBadge({ category, className }: { category: LfCategory; className?: string }) {
  const Icon = LF_CATEGORY_ICONS[category] ?? LF_CATEGORY_ICONS.Other;
  return (
    <span className={cn(pill, "bg-surface-accent text-accent-text border-border", className)}>
      <Icon className="size-3" />
      {category}
    </span>
  );
}

export function LfHeldBadge({ heldAt, className }: { heldAt: LfHeldAt; className?: string }) {
  return (
    <span className={cn(pill, "bg-neutral-bg text-neutral-fg border-neutral-fg/30", className)}>{LF_HELD_LABELS[heldAt]}</span>
  );
}

/** Item photo, or a category icon when there is none. Blurred copies come from the server (never CSS-only). */
export function ItemPhoto({
  src,
  blurred,
  category,
  alt,
  className,
}: {
  src: string | null;
  blurred?: boolean;
  category: LfCategory;
  alt: string;
  className?: string;
}) {
  const Icon = LF_CATEGORY_ICONS[category] ?? CircleHelp;
  return (
    <div className={cn("relative grid place-items-center overflow-hidden bg-surface-accent text-accent-text", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public URL or the blurred API route
        <img src={src} alt={alt} loading="lazy" className="size-full object-cover" />
      ) : (
        <Icon className="size-10 opacity-60" aria-hidden="true" />
      )}
      {blurred && (
        <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-scrim px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
          <EyeOff className="size-3" /> Hidden for privacy
        </span>
      )}
    </div>
  );
}

export function PlaceLine({ building, spot, className }: { building: string | null; spot: string | null; className?: string }) {
  const text = [building, spot].filter(Boolean).join(" · ");
  if (!text) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm text-text-muted", className)}>
      <MapPin className="size-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  );
}
