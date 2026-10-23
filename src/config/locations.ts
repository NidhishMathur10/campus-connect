export const BUILDINGS = [
  "Old Hostel",
  "New Hostel",
  "Block A",
  "Block B",
  "Block C",
  "Block D",
  "Girls Mess",
  "Old Hostel Mess",
  "New Hostel Mess",
  "Gym",
  "Sports Complex",
] as const;
export type Building = (typeof BUILDINGS)[number];

export const BUILDING_INFO: Record<
  Building,
  { description: string; kind: "hostel" | "academic" | "mess" | "facility" }
> = {
  "Old Hostel": { description: "Mixed hostel — Boys Wing & Girls Wing", kind: "hostel" },
  "New Hostel": { description: "Boys hostel", kind: "hostel" },
  "Block A": { description: "Academic block (contains the Library)", kind: "academic" },
  "Block B": { description: "Academic block", kind: "academic" },
  "Block C": { description: "Academic block", kind: "academic" },
  "Block D": { description: "Academic block", kind: "academic" },
  "Girls Mess": { description: "Mess for girls", kind: "mess" },
  "Old Hostel Mess": { description: "Boys mess (Old Hostel)", kind: "mess" },
  "New Hostel Mess": { description: "Boys mess (New Hostel)", kind: "mess" },
  Gym: { description: "Inside Old Hostel", kind: "facility" },
  "Sports Complex": { description: "Courts; sports material is issued here", kind: "facility" },
};

/** Buildings shown in the Education (academic) report form. */
export const ACADEMIC_BUILDINGS: Building[] = ["Block A", "Block B", "Block C", "Block D"];

export const FLOORS = ["Basement", "Ground", "1st", "2nd", "3rd", "4th", "5th"] as const;
export type Floor = (typeof FLOORS)[number];

export const SPOT_SUGGESTIONS = [
  "Room",
  "Washroom",
  "Corridor",
  "Common room",
  "Pantry / water cooler",
  "Laundry area",
  "Classroom",
  "Lab",
  "Library",
  "Court",
  "Dining hall",
  "Kitchen",
] as const;

/** Hostels a student can live in (used on sign-up). New Hostel is boys only. */
export const HOSTELS = {
  "Old Hostel": ["Boys Wing", "Girls Wing"],
  "New Hostel": ["Boys Wing"],
} as const;
export type Hostel = keyof typeof HOSTELS;

export const WASHING_MACHINES: { building: Building; floor: Floor; ids: string[] }[] = [
  { building: "New Hostel", floor: "Ground", ids: ["NH-G-W1", "NH-G-W2", "NH-G-W3", "NH-G-W4"] },
  { building: "New Hostel", floor: "3rd", ids: ["NH-3-W1", "NH-3-W2", "NH-3-W3", "NH-3-W4"] },
  { building: "Old Hostel", floor: "Ground", ids: ["OH-G-W1", "OH-G-W2", "OH-G-W3"] },
  { building: "Old Hostel", floor: "Basement", ids: ["OH-B-W1", "OH-B-W2", "OH-B-W3"] },
];

export const ALL_MACHINE_IDS = WASHING_MACHINES.flatMap((m) => m.ids);

/** Machine IDs available at a building + floor (empty if that floor has no laundry). */
export function getMachines(building?: string | null, floor?: string | null): string[] {
  return (
    WASHING_MACHINES.find((m) => m.building === building && m.floor === floor)?.ids ?? []
  );
}

/** The Library is inside Block A. */
export const LIBRARY_BUILDING: Building = "Block A";

/** Academic room codes: "B-204" / "B204" → Block B, 2nd floor (first digit = floor, 0 = Ground). */
export function parseRoomCode(spot: string | null | undefined): { building: Building; floor: Floor } | null {
  const m = spot?.toUpperCase().match(/\b([A-D])\s*-?\s*([0-5])\d{2}\b/);
  if (!m) return null;
  const floor: Floor = m[2] === "0" ? "Ground" : (["1st", "2nd", "3rd", "4th", "5th"] as const)[Number(m[2]) - 1];
  return { building: `Block ${m[1]}` as Building, floor };
}

/** Plain-text location list for AI prompts. */
export function locationsPromptText(): string {
  const buildings = BUILDINGS.map((b) => `- ${b}: ${BUILDING_INFO[b].description}`).join("\n");
  const machines = WASHING_MACHINES.map(
    (m) => `- ${m.building} ${m.floor}: ${m.ids.join(", ")}`,
  ).join("\n");
  return `Buildings:\n${buildings}\nFloors: ${FLOORS.join(", ")}\nWashing machines:\n${machines}`;
}
