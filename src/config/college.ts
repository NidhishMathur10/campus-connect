export const APP_NAME = "CampusConnect";

export const COLLEGE_NAME =
  process.env.NEXT_PUBLIC_COLLEGE_NAME?.trim() || "Your College";

/** Internal email domain. Roll number (or staff ID) is the username. */
export const EMAIL_DOMAIN = "campusconnect.app";

/** "2616400101" -> "2616400101@campusconnect.app". Full emails pass through. */
export function loginIdToEmail(loginId: string): string {
  const id = loginId.trim().toLowerCase();
  return id.includes("@") ? id : `${id}@${EMAIL_DOMAIN}`;
}

/** Ticket number prefix, e.g. CC-1001 (the number comes from a DB sequence). */
export const TICKET_PREFIX = "CC-";
