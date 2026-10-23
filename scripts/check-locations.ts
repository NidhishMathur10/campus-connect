// Offline check of the hostel room / scope rules (no database, no Gemini):
//   npx tsx --conditions=react-server scripts/check-locations.ts
import { sharesPlace } from "../src/lib/ai/duplicates";
import { floorHotspotKey, hotspotKey, hotspotKeys, hotspotLabel, parseHotspotKey } from "../src/lib/hotspots";
import { floorFromRoom, normaliseRoom } from "../src/config/locations";

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✗"} ${name}${ok ? "" : `  → got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}`);
}

// Duplicate candidates (same module, category, building, open, 7 days are already guaranteed)
const room = (floor: string, room_no: string, scope: "room" | "floor" | "building" | null = "room") => ({ floor, room_no, scope });
check("roommates (same room) match", sharesPlace(room("2nd", "204"), room("2nd", "204")), true);
check("room 204 vs 'room 204' normalised", sharesPlace(room("2nd", "204"), room("2nd", "Room 204")), true);
check("different rooms, room scope: never duplicates", sharesPlace(room("2nd", "204"), room("2nd", "207")), false);
check("new floor-scope matches another room on the same floor", sharesPlace(room("2nd", "219", "floor"), room("2nd", "204", "floor")), true);
check("existing floor-scope covers a room-scope report on that floor", sharesPlace(room("2nd", "212"), room("2nd", "204", "floor")), true);
check("floor-scope does not reach another floor", sharesPlace(room("3rd", "304", "floor"), room("2nd", "204", "floor")), false);
check("building-scope matches any floor", sharesPlace(room("3rd", "304", "building"), room("2nd", "204", "room")), true);
check("common area vs room: not duplicates", sharesPlace({ floor: "2nd", room_no: null, scope: null }, room("2nd", "204")), false);
check("two common-area tickets on the same floor match", sharesPlace({ floor: "2nd", room_no: null, scope: null }, { floor: "2nd", room_no: null, scope: null }), true);

// Hotspot keys
const t = { module: "hostel" as const, category: "Plumbing", building: "New Hostel", floor: "2nd" };
check("room key", hotspotKey({ ...t, room_no: "204", spot: null }), "hostel|Plumbing|New Hostel|2nd|204");
check("floor-level key", floorHotspotKey({ ...t, room_no: "204", spot: null }), "hostel|Plumbing|New Hostel|2nd|*");
check("common area key", hotspotKey({ ...t, room_no: null, spot: "Other: lift lobby" }), "hostel|Plumbing|New Hostel|2nd|@Other");
check("hostel ticket with no place can't be grouped", hotspotKey({ ...t, room_no: null, spot: null }), null);
check("mess keeps the legacy key shape", hotspotKey({ module: "hostel", category: "Mess Food", building: "Old Hostel Mess", floor: null, room_no: null, spot: "Lunch" }), "hostel|Mess Food|Old Hostel Mess|");
check("academic keeps block + floor", hotspotKey({ module: "academic", category: "Classroom Facilities", building: "Block B", floor: "2nd", room_no: null, spot: "B-204" }), "academic|Classroom Facilities|Block B|2nd");
check("keys for a room ticket", hotspotKeys({ ...t, room_no: "204", spot: null }).length, 2);
check("parse floor-level", parseHotspotKey("hostel|Water Supply|New Hostel|2nd|*").floorLevel, true);
check("parse room", parseHotspotKey("hostel|Plumbing|New Hostel|2nd|204").room, "204");
check("label floor-level", hotspotLabel("hostel|Water Supply|New Hostel|2nd|*"), "Water Supply · New Hostel, 2nd floor — floor-level issue");
check("label room", hotspotLabel("hostel|Plumbing|New Hostel|2nd|204"), "Plumbing · New Hostel, 2nd floor, Room 204");

// Room helpers
check("floor from 204", floorFromRoom("204"), "2nd");
check("floor from G-108", floorFromRoom("G-108"), "1st");
check("floor from B-305", floorFromRoom("B-305"), "3rd");
check("normaliseRoom", normaliseRoom(" room 2 04 "), "204");

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nAll location checks passed ✔");
