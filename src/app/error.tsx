"use client";

import { TriangleAlert } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <Logo className="justify-center" />
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <TriangleAlert className="size-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">Please try again. If it keeps happening, tell the team.</p>
        </div>
        <Button onClick={reset} className="w-full">Try again</Button>
      </div>
    </main>
  );
}
