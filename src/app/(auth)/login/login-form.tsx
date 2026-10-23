"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_ACCOUNTS, DEMO_GROUPS, DEMO_PASSWORD, type DemoAccount } from "@/config/demo-accounts";
import { cn } from "@/lib/utils";
import { signIn, type FormState } from "../actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signIn, {});
  const formRef = useRef<HTMLFormElement>(null);
  const idRef = useRef<HTMLInputElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);

  function quickLogin(account: DemoAccount) {
    if (!idRef.current || !pwRef.current) return;
    idRef.current.value = account.loginId;
    pwRef.current.value = DEMO_PASSWORD;
    formRef.current?.requestSubmit();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Welcome back</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">Log in</h1>
        <p className="text-sm text-slate-600">
          Students use their roll number. Staff use their staff ID.
        </p>
      </div>

      <form ref={formRef} action={formAction} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="loginId">Roll number / Staff ID</Label>
          <Input
            ref={idRef}
            id="loginId"
            name="loginId"
            placeholder="e.g. 2616400101"
            autoComplete="username"
            defaultValue={state.values?.loginId}
            key={state.values?.loginId}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            ref={pwRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        {state.error && (
          <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />}
          {pending ? "Logging in…" : "Log in"}
        </Button>
        <p className="text-center text-sm text-slate-600">
          New student?{" "}
          <Link href="/signup" className="font-bold text-accent-text hover:underline">
            Create an account
          </Link>
        </p>
      </form>

      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <p className="eyebrow">Demo quick login</p>
          <span className="rounded-full bg-sky-tint px-2.5 py-1 text-[11px] font-semibold text-slate-600">
            password: {DEMO_PASSWORD}
          </span>
        </div>
        <div className="space-y-4">
          {DEMO_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-xs font-bold text-slate-500">{group.label}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DEMO_ACCOUNTS.filter((a) => !a.hidden && group.roles.includes(a.role)).map((a) => (
                  <button
                    key={a.loginId}
                    type="button"
                    disabled={pending}
                    onClick={() => quickLogin(a)}
                    className={cn(
                      "rounded-2xl border border-border bg-page px-3 py-2 text-left transition-all",
                      "hover:-translate-y-0.5 hover:border-accent-blue hover:bg-sky-tint disabled:opacity-50",
                    )}
                  >
                    <span className="block truncate text-sm font-bold text-foreground">{a.fullName}</span>
                    <span className="block truncate text-[11px] text-slate-500">{a.caption}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
