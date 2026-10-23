/**
 * College email rules, shared by the server and the client forms.
 * The domain comes from COLLEGE_EMAIL_DOMAIN (server env); client components receive it as a prop
 * from their server page so both sides always agree.
 */
export const DEFAULT_COLLEGE_EMAIL_DOMAIN = "zenithschool.ai";

export function collegeEmailDomain(): string {
  const raw = process.env.COLLEGE_EMAIL_DOMAIN?.trim().toLowerCase().replace(/^@/, "");
  return raw || DEFAULT_COLLEGE_EMAIL_DOMAIN;
}

export function collegeEmailError(domain: string): string {
  return `Please use your college email (@${domain})`;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Case-insensitive: "<something>@<domain>" with a plain local part. */
export function isCollegeEmail(email: string, domain: string): boolean {
  const e = normaliseEmail(email);
  const suffix = `@${domain.toLowerCase()}`;
  if (!e.endsWith(suffix)) return false;
  return /^[a-z0-9._%+-]+$/.test(e.slice(0, -suffix.length));
}

/** Pre-filled value on the sign-up form. */
export function defaultStudentEmail(rollNo: string, domain: string): string {
  const id = rollNo.trim().toLowerCase();
  return id ? `${id}@${domain}` : "";
}
