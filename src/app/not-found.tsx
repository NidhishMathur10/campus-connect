import Link from "next/link";
import { SearchX } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function NotFound() {
  return (
    <main className="relative grid min-h-dvh place-items-center px-4">
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <Logo className="justify-center" />
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-sky-tint text-accent-text">
          <SearchX className="size-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground">The page you are looking for doesn&apos;t exist or has moved.</p>
        </div>
        <Button asChild className="w-full"><Link href="/">Back to home</Link></Button>
      </div>
    </main>
  );
}
