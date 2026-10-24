"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { COLLEGE_NAME } from "@/config/college";
import { isFaculty } from "@/config/faculty";
import { cn } from "@/lib/utils";
import type { Role } from "@/config/roles";
import { isActive, MESS_COMMITTEE_NAV, STAFF_NAV, type NavItem } from "./nav-items";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "./notification-bell";
import { UserAvatar, UserMenu, type ShellUser } from "./user-menu";

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((item, idx) => {
        const heading = item.group && item.group !== items[idx - 1]?.group ? item.group : null;
        const active = isActive(pathname, item.href, items);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            {heading && <p className={cn("eyebrow mb-1 px-3", idx > 0 && "mt-4")}>{heading}</p>}
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                active ? "bg-primary text-primary-fg shadow-sm" : "text-text-muted hover:bg-surface-accent hover:text-text",
              )}
            >
              <Icon className="size-4.5" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Staff/admin layout: sidebar on laptop, pill top bar + slide-out menu on mobile. */
export function StaffShell({
  user,
  role,
  userId,
  children,
}: {
  user: ShellUser;
  /** Faculty (who report issues) and the Security Officer (Lost & Found claims) get the notification bell. */
  userId: string;
  role: Exclude<Role, "student">;
  children: ReactNode;
}) {
  const items = role === "staff" && user.subtitle === "Mess Committee" ? [...STAFF_NAV[role], ...MESS_COMMITTEE_NAV] : STAFF_NAV[role];
  const showBell = isFaculty(role) || role === "security_officer" || role === "sports_incharge";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:pl-72">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 p-4 lg:block">
        <div className="flex h-full flex-col rounded-3xl border border-border/80 bg-surface p-4 shadow-float">
          <Link href={items[0]?.href ?? "/"} className="px-2 pt-1">
            <Logo />
          </Link>
          <p className="mt-1 px-2 text-xs font-semibold text-text-muted">{COLLEGE_NAME}</p>

          <p className="eyebrow mt-8 mb-2 px-3">Workspace</p>
          <NavLinks items={items} pathname={pathname} />

          <div className="mt-auto flex items-center justify-between px-2 pb-3">
            <span className="eyebrow">Theme</span>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-surface-accent p-3">
            <UserAvatar name={user.fullName} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text">{user.fullName}</p>
              <p className="truncate text-xs text-text-muted">{user.subtitle ?? user.roleLabel}</p>
            </div>
            {showBell && <NotificationBell userId={userId} align="start" />}
            <UserMenu user={user} align="start" />
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 px-3 pt-3 lg:hidden">
        <nav className="flex h-14 items-center justify-between gap-2 rounded-full border border-border/80 bg-surface/90 py-2 pr-2 pl-2 shadow-float backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 rounded-r-3xl p-4">
              <SheetHeader className="p-0 pt-1">
                <SheetTitle asChild>
                  <div><Logo /></div>
                </SheetTitle>
                <p className="text-xs font-semibold text-text-muted">{COLLEGE_NAME}</p>
              </SheetHeader>
              <p className="eyebrow mt-6 mb-2 px-3">Workspace</p>
              <NavLinks items={items} pathname={pathname} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Logo showText={false} />
          <div className="flex items-center gap-1">
            <ThemeToggle variant="menu" />
            {showBell && <NotificationBell userId={userId} />}
            <UserMenu user={user} />
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-12 sm:px-8 lg:pt-10">{children}</main>
    </div>
  );
}
