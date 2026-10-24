"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CircleDot, Dices, Dumbbell, Goal, Target, Trophy, Volleyball, type LucideIcon } from "lucide-react";
import { LOAN_STATUS_LABELS, type LoanStatus } from "@/config/sports";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Football: Goal,
  Basketball: CircleDot,
  Volleyball: Volleyball,
  Badminton: Target,
  Cricket: Trophy,
  "Table Tennis": Dumbbell,
  "Indoor games": Dices,
};

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Dumbbell;
  return <Icon className={className} />;
}

const STATUS_STYLE: Record<LoanStatus, string> = {
  reserved: "bg-info-bg text-info-fg",
  issued: "bg-success-bg text-success-fg",
  returned: "bg-neutral-bg text-neutral-fg",
  expired: "bg-neutral-bg text-neutral-fg",
  overdue: "bg-danger-bg text-danger-fg",
};

export function LoanStatusBadge({ status }: { status: LoanStatus }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold", STATUS_STYLE[status])}>
      {LOAN_STATUS_LABELS[status]}
    </span>
  );
}

/** QR of the pickup code. Always black on white so a phone camera can read it in dark mode too. */
export function PickupQr({ code, size = 176 }: { code: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(code, { margin: 2, width: size * 2, color: { dark: "#000000", light: "#ffffff" } }) // theme-ok: QR must be black on white to scan
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [code, size]);
  if (!src) return <div style={{ width: size, height: size }} className="animate-pulse rounded-2xl bg-surface-2" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`QR code for pickup code ${code}`} width={size} height={size} className="rounded-2xl border border-border" />;
}

/** The big pickup code, spaced out so it is easy to read out loud. */
export function PickupCode({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn("font-mono text-4xl font-extrabold tracking-[0.25em] text-text", className)} aria-label={`Pickup code ${code.split("").join(" ")}`}>
      {code}
    </span>
  );
}
