import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME, COLLEGE_NAME } from "@/config/college";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const TAGLINE = "Every campus complaint, tracked to resolution";
const DESCRIPTION =
  "Report campus issues in your own words, in Hindi or English. AI turns them into clear tickets, routes them to the right team and tracks them until they're fixed.";

// Absolute base so link previews (WhatsApp, Slack...) get a full image URL.
const siteUrl =
  process.env.APP_URL?.trim() ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${APP_NAME} · ${TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    type: "website",
    siteName: `${APP_NAME} · ${COLLEGE_NAME}`,
    title: `${APP_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: `${APP_NAME} — ${TAGLINE}`, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" }, // theme-ok (browser chrome colour, cannot use CSS vars)
    { media: "(prefers-color-scheme: dark)", color: "#0B1120" }, // theme-ok
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${manrope.variable} h-full antialiased`}>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
