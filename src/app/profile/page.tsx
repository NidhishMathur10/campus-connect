import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { EmailForm } from "@/components/profile/email-form";
import { WhatsappForm } from "@/components/profile/whatsapp-form";
import { InstallApp, PushToggle } from "@/components/push/push-controls";
import { collegeEmailDomain } from "@/config/email";
import { isFaculty } from "@/config/faculty";
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
    ["My subjects", profile.role === "teacher" && profile.subjects?.length ? profile.subjects.join(", ") : null],
    ["Hostel", [profile.hostel, profile.wing, profile.room && `Room ${profile.room}`].filter(Boolean).join(" · ") || null],
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader eyebrow="Account" title="Profile" description="Your details and where we send ticket updates." />

      <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <p className="eyebrow">Your details</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          {details
            .filter(([, value]) => !!value)
            .map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold text-text-muted">{label}</dt>
                <dd className="text-sm font-bold text-text">{value}</dd>
              </div>
            ))}
        </dl>
      </section>

      <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <p className="eyebrow">College email</p>
        <p className="text-sm text-text-muted">
          Ticket updates and answers are emailed here. It must be a college address (@{collegeEmailDomain()}).
        </p>
        <EmailForm initialEmail={profile.email ?? ""} domain={collegeEmailDomain()} />
      </section>

      <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <p className="eyebrow">WhatsApp updates</p>
        <p className="text-sm text-text-muted">
          Save your number so staff can reach you on WhatsApp. Automated alerts are coming soon.
        </p>
        <WhatsappForm initialPhone={profile.phone ?? ""} initialOptIn={profile.whatsapp_optin} />
      </section>

      <section className="animate-slide-up space-y-3 rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <p className="eyebrow">Phone notifications &amp; app</p>
        <p className="text-sm text-text-muted">
          {profile.role === "student" || isFaculty(profile.role)
            ? "Get a notification on this phone when your ticket changes. Works best once the app is installed."
            : "Get a notification on this phone the moment a job is assigned to you. Staff rarely check email, so turn this on."}
        </p>
        <PushToggle
          audience={profile.role === "student" || isFaculty(profile.role) ? "student" : "staff"}
        />
        <InstallApp />
      </section>
    </div>
  );
}
