"use client";

import "./globals.css";

/** Last-resort error page (replaces the root layout), so it brings its own <html> and styles. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="grid min-h-dvh place-items-center px-4">
          <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
            <h1 className="text-2xl font-extrabold text-text">Something went wrong</h1>
            <p className="text-sm text-text-muted">CampusConnect hit an unexpected problem. Please try again.</p>
            <button
              type="button"
              onClick={reset}
              className="h-11 w-full rounded-full bg-primary px-5 text-sm font-semibold text-primary-fg"
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
