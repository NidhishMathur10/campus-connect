"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { COLLEGE_NAME } from "@/config/college";
import { cn } from "@/lib/utils";
import { isActive, STUDENT_NAV } from "./nav-items";
import { UserMenu, type ShellUser } from "./user-menu";

/** Student layout: floating pill navbar on top, bottom tab bar on mobile. */
export function StudentShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
        <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full border border-slate-200/80 bg-white/90 py-2 pr-2 pl-4 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.18)] backdrop-blur">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <Logo />
            <span className="hidden truncate rounded-full bg-sky-tint px-2.5 py-1 text-xs font-semibold text-slate-600 lg:inline">
              {COLLEGE_NAME}
            </span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
            {STUDENT_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                      active ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100 hover:text-navy",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <UserMenu user={user} />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-10 md:pb-12">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-4">
          {STUDENT_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors",
                    active ? "text-navy" : "text-slate-400",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-12 place-items-center rounded-full transition-colors",
                      active && "bg-sky-tint-2",
                    )}
                  >
                    <Icon className="size-5" />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
