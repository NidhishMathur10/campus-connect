import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { EmailForm } from "@/components/profile/email-form";
import { collegeEmailDomain } from "@/config/email";
import { ROLE_LABELS } from "@/config/roles";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const profile = await requireProfile();
  const details: [string, string | null][] = [
    ["Name", profile.full_name],
    ["Role", ROLE_LABELS[profile.role]],
    ["Roll number", profile.roll_no],
    ["Department", profile.department],
    ["Hostel", [profile.hostel, profile.wing, profile.room && `Room ${profile.room}`].filter(Boolean).join(" · ") || null],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Account" title="Profile" description="Your details and where we send ticket updates." />

      <section className="animate-slide-up space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="eyebrow">Your details</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {details
            .filter(([, value]) => !!value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                <dd className="text-sm font-bold text-navy">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section className="animate-slide-up space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="eyebrow">College email</p>
        <p className="text-sm text-slate-600">
          Ticket updates and answers are emailed here. It must be a college address (@{collegeEmailDomain()}).
        </p>
        <EmailForm initialEmail={profile.email ?? ""} domain={collegeEmailDomain()} />
      </section>
    </div>
  );
}
