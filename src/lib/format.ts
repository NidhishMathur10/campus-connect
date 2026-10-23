/** Small display helpers shared by server and client components. */

export function timeAgo(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function formatLocation(
  t: { building?: string | null; floor?: string | null; spot?: string | null; machine_id?: string | null },
): string {
  const floor = t.floor ? (t.floor === "Basement" || t.floor === "Ground" ? t.floor : `${t.floor} floor`) : null;
  return [t.building, floor, t.spot, t.machine_id].filter(Boolean).join(" · ") || "Location not given";
}

export const LANGUAGE_NAMES: Record<string, string> = { en: "English", hi: "Hindi" };

export function languageName(code: string | null | undefined): string {
  if (!code) return "English";
  return LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

/** "cc 1004", "1004", "CC-1004" → "CC-1004"; null if it doesn't look like a ticket number. */
export function normaliseTicketNo(raw: string): string | null {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  const m = value.trim().toUpperCase().match(/^(?:CC)?[-\s]?(\d{1,7})$/);
  return m ? `CC-${m[1]}` : null;
}
