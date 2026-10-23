import { isHostelBuilding, isOtherArea } from "@/config/locations";
import type { TicketModule } from "@/config/routing";

/**
 * Recurring-issue keys: `module|category|building|floor|place`.
 *  - place = room number           → "same room + category" (hostel rooms)
 *  - place = "@Corridor" etc.      → same common area
 *  - place = "*"                   → FLOOR-LEVEL: several different rooms on one floor
 *  - no place (4 segments)         → whole building/floor (academic blocks, messes, gym…)
 */
export interface HotspotFields {
  module: TicketModule;
  category: string;
  building: string | null;
  floor: string | null;
  room_no?: string | null;
  spot?: string | null;
}

export const FLOOR_PLACE = "*";

/** Common area as grouped for recurrence ("Other: lift lobby" → "Other"). */
export function commonAreaOf(spot: string | null | undefined): string | null {
  const s = spot?.trim();
  if (!s) return null;
  return isOtherArea(s) ? "Other" : s;
}

/** Place-level key: the same room (or common area) with the same category. */
export function hotspotKey(t: HotspotFields): string | null {
  // Safety & Security reports never form hotspots (Insights shows only aggregated counts).
  if (!t.building || t.module === "security") return null;
  let place = "";
  if (t.module === "hostel" && isHostelBuilding(t.building)) {
    if (t.room_no) place = t.room_no;
    else if (commonAreaOf(t.spot)) place = `@${commonAreaOf(t.spot)}`;
    else return null; // hostel ticket without a known place can't be grouped
  }
  return [t.module, t.category, t.building, t.floor ?? "", place].join("|").replace(/\|$/, "");
}

/** Floor-level key: used to count different rooms on one floor with the same problem. */
export function floorHotspotKey(t: HotspotFields): string | null {
  if (t.module !== "hostel" || !isHostelBuilding(t.building) || !t.floor || !t.room_no) return null;
  return [t.module, t.category, t.building, t.floor, FLOOR_PLACE].join("|");
}

/** Every key a ticket can contribute to. */
export function hotspotKeys(t: HotspotFields): string[] {
  return [hotspotKey(t), floorHotspotKey(t)].filter((k): k is string => !!k);
}

export interface ParsedHotspot {
  module: TicketModule;
  category: string;
  building: string;
  floor: string | null;
  /** Hostel room, when the hotspot is one room. */
  room: string | null;
  /** Hostel common area, when the hotspot is a shared space. */
  area: string | null;
  /** Several different rooms on the same floor. */
  floorLevel: boolean;
}

export function parseHotspotKey(key: string): ParsedHotspot {
  const [module, category, building, floor, place] = key.split("|");
  return {
    module: module as TicketModule,
    category,
    building,
    floor: floor || null,
    room: place && place !== FLOOR_PLACE && !place.startsWith("@") ? place : null,
    area: place?.startsWith("@") ? place.slice(1) : null,
    floorLevel: place === FLOOR_PLACE,
  };
}

/** "Plumbing · New Hostel, 2nd floor, Room 204" / "Water Supply · New Hostel, 2nd floor — floor-level issue" */
export function hotspotLabel(key: string): string {
  const { category, building, floor, room, area, floorLevel } = parseHotspotKey(key);
  const floorText = floor ? (floor === "Basement" || floor === "Ground" ? floor : `${floor} floor`) : null;
  const where = [building, floorText, room ? `Room ${room}` : area].filter(Boolean).join(", ");
  return `${category} · ${where}${floorLevel ? " — floor-level issue" : ""}`;
}
