/** Safety & Security contacts shown on the emergency panel (CLAUDE.md §12). */

/** Placeholder — set NEXT_PUBLIC_CAMPUS_SECURITY_PHONE to the real security desk number. */
export const CAMPUS_SECURITY_PHONE = process.env.NEXT_PUBLIC_CAMPUS_SECURITY_PHONE?.trim() || "+91 00000 00000";

export const NATIONAL_EMERGENCY = "112";

export const ANTI_RAGGING_HELPLINE = {
  phone: "1800-180-5522",
  email: "helpline@antiragging.in",
  website: "www.antiragging.in",
} as const;

/** Shown instead of the student's name on "Hide my name" safety reports. */
export const CONFIDENTIAL_REPORTER = "Confidential reporter";

/** "1800-180-5522" -> "tel:18001805522" */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
