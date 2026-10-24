import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModuleTab {
  value: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Unread count shown as a small red badge. */
  badge?: number;
}

/** Pill tab bar for a module page (Hostel, Education); every tab is a plain link. */
export function ModuleTabs({ tabs, active }: { tabs: ModuleTab[]; active: string }) {
  return (
    <nav className="mb-6 flex w-full gap-1 overflow-x-auto rounded-full border border-border bg-surface p-1 shadow-sm sm:w-fit">
      {tabs.map(({ value, label, icon: Icon, href, badge }) => (
        <Link
          key={value}
          href={href}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-bold whitespace-nowrap transition-colors sm:flex-none",
            active === value ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2",
          )}
        >
          <Icon className="size-4" /> {label}
          {!!badge && badge > 0 && (
            <span className="grid min-w-5 place-items-center rounded-full bg-danger-solid px-1.5 text-[11px] font-bold text-danger-solid-fg">
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
