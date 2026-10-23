"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

export interface ShellUser {
  fullName: string;
  roleLabel: string;
  subtitle?: string | null;
}

export function initials(name: string) {
  return name
    .replace(/^(Mr|Mrs|Ms|Dr|Prof)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-accent-blue to-accent-violet text-xs font-bold text-white",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu({ user, align = "end" }: { user: ShellUser; align?: "start" | "end" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full p-0.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <UserAvatar name={user.fullName} />
        <span className="sr-only">Open account menu</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-60 rounded-2xl p-2">
        <DropdownMenuLabel className="space-y-0.5 px-2 py-1.5">
          <p className="truncate text-sm font-bold text-navy">{user.fullName}</p>
          <p className="truncate text-xs font-medium text-slate-500">
            {user.roleLabel}
            {user.subtitle ? ` · ${user.subtitle}` : ""}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="rounded-xl">
          <Link href="/profile">
            <UserRound className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <form action={signOut}>
          <DropdownMenuItem asChild className="rounded-xl">
            <button type="submit" className="w-full">
              <LogOut className="size-4" />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
