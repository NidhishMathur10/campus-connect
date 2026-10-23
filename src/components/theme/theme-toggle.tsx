"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const OPTIONS: { value: "light" | "dark" | "system"; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const subscribe = () => () => {};

function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** Small segmented control: sun / moon / monitor. */
function Segmented({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? (theme ?? "system") : "system";
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("inline-flex items-center rounded-full border border-border bg-surface-2 p-0.5", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = current === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors",
              active ? "bg-primary text-primary-fg shadow-sm" : "text-text-muted hover:text-text",
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}

/** Single icon button that opens a Light / Dark / System menu (for tight mobile navbars). */
function Menu({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const mounted = useMounted();
  const Icon = mounted && resolvedTheme === "dark" ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Change theme"
        className={cn("grid size-9 place-items-center rounded-full text-text-muted transition-colors outline-none hover:bg-surface-2 hover:text-text focus-visible:ring-3 focus-visible:ring-ring/50", className)}
      >
        <Icon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup value={mounted ? (theme ?? "system") : "system"} onValueChange={setTheme}>
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="size-4" /> {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Light / Dark / System switcher.
 * variant "auto" (navbars) = icon menu on phones, segmented control from `sm` up.
 */
export function ThemeToggle({ variant = "segmented", className }: { variant?: "segmented" | "menu" | "auto"; className?: string }) {
  if (variant === "segmented") return <Segmented className={className} />;
  if (variant === "menu") return <Menu className={className} />;
  return (
    <>
      <Menu className={cn("sm:hidden", className)} />
      <Segmented className={cn("hidden sm:inline-flex", className)} />
    </>
  );
}
