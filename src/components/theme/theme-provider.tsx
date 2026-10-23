"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Class-based dark mode ("dark" class on <html>); default follows the OS; choice is remembered per browser. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="cc-theme">
      {children}
    </NextThemesProvider>
  );
}
