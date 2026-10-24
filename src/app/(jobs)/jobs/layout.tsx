import { cookies } from "next/headers";
import { JobsProvider } from "@/components/jobs/jobs-provider";
import { LANG_COOKIE, type Lang } from "@/components/jobs/i18n";
import { requireProfile } from "@/lib/auth";

const serverNow = () => Date.now();

/** Simple, phone-first workspace for department staff ("My Jobs"). The full board stays at /staff. */
export default async function JobsLayout({ children }: { children: React.ReactNode }) {
  await requireProfile(["staff", "security_officer"]);
  const lang: Lang = (await cookies()).get(LANG_COOKIE)?.value === "hi" ? "hi" : "en";

  return (
    <JobsProvider initialLang={lang} initialNow={serverNow()}>
      <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 pt-4 pb-16 sm:pt-6">{children}</main>
    </JobsProvider>
  );
}
