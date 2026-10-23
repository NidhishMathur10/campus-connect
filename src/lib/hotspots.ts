import type { TicketModule } from "@/config/routing";

/** Location + category combo used for recurring-issue detection, e.g. `hostel|Plumbing|New Hostel|2nd`. */
export function hotspotKey(t: { module: TicketModule; category: string; building: string | null; floor: string | null }): string | null {
  if (!t.building) return null;
  return [t.module, t.category, t.building, t.floor ?? ""].join("|");
}

export function parseHotspotKey(key: string): { module: TicketModule; category: string; building: string; floor: string | null } {
  const [module, category, building, floor] = key.split("|");
  return { module: module as TicketModule, category, building, floor: floor || null };
}

/** "Plumbing · New Hostel, 2nd floor" */
export function hotspotLabel(key: string): string {
  const { category, building, floor } = parseHotspotKey(key);
  const where = floor ? `${building}, ${floor === "Basement" || floor === "Ground" ? floor : `${floor} floor`}` : building;
  return `${category} · ${where}`;
}
