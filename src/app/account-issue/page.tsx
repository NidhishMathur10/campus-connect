import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { signOut } from "@/app/(auth)/actions";

/** Shown when a user is signed in but has no profile row (setup problem). */
export default function AccountIssuePage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Logo className="justify-center" />
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <TriangleAlert className="size-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-navy">Your account isn&apos;t set up yet</h1>
          <p className="text-sm text-slate-600">
            You&apos;re signed in, but there&apos;s no profile for this account. Ask the team to run
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5">npm run seed</code>
            or check that <code className="rounded bg-slate-100 px-1.5 py-0.5">schema.sql</code> was run.
          </p>
        </div>
        <form action={signOut}>
          <Button type="submit" className="w-full">Sign out</Button>
        </form>
      </div>
    </main>
  );
}
