"use client";

import { useRef } from "react";
import { DoorOpen, Home, Users } from "lucide-react";
import { SimpleSelect } from "@/components/common/simple-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { floorFromRoom, getMachines, HOSTEL_COMMON_AREAS, normaliseRoom } from "@/config/locations";
import { cn } from "@/lib/utils";
import type { ReportDraft } from "./report-form";

/** The student's own hostel + room, from their profile. */
export interface OwnRoom {
  hostel: string | null;
  room: string | null;
}

/** Draft for a fresh hostel report: the student's own hostel, floor and room are pre-filled. */
export function hostelDraft(base: ReportDraft, own: OwnRoom): ReportDraft {
  const room = normaliseRoom(own.room);
  if (!own.hostel || !room) return base;
  return { ...base, building: own.hostel, floor: floorFromRoom(room) ?? base.floor, place: "room", room };
}

/** Switching building keeps the pre-fill honest: own room only applies to the own hostel. */
export function applyBuilding(draft: ReportDraft, building: string | null, own: OwnRoom | undefined): ReportDraft {
  const next: ReportDraft = { ...draft, building, machineId: null };
  const ownRoom = normaliseRoom(own?.room);
  if (!own || !ownRoom) return next;
  if (building === own.hostel && draft.place === "room" && !draft.room) {
    return { ...next, room: ownRoom, floor: floorFromRoom(ownRoom) ?? next.floor };
  }
  if (building !== own.hostel && draft.room === ownRoom) return { ...next, room: "" };
  return next;
}

/**
 * Hostel location: building → floor (chosen above) → EITHER a room number OR a common area.
 * Every room has its own attached washroom, bathroom and balcony, so there is no washroom picker.
 */
export function HostelPlace({
  draft,
  own,
  onChange,
  disabled,
  error,
}: {
  draft: ReportDraft;
  own?: OwnRoom;
  onChange: (patch: Partial<ReportDraft>) => void;
  disabled?: boolean;
  error?: string;
}) {
  const roomRef = useRef<HTMLInputElement>(null);
  const ownRoom = normaliseRoom(own?.room);
  const isOwnHostel = !!own && draft.building === own.hostel;
  const usingOwn = !!ownRoom && isOwnHostel && normaliseRoom(draft.room) === ownRoom;
  const machines = draft.area === "Laundry machine" ? getMachines(draft.building, draft.floor) : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-full border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="Where in the hostel">
        {(
          [
            { value: "room", label: "A room", icon: DoorOpen },
            { value: "common", label: "Common area", icon: Users },
          ] as const
        ).map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={draft.place === value}
            disabled={disabled}
            onClick={() => onChange({ place: value })}
            className={cn(
              "flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors",
              draft.place === value ? "bg-navy text-white shadow-sm" : "text-slate-600 hover:bg-white",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {draft.place === "room" ? (
        <div className="space-y-1.5">
          <Label htmlFor="room-no">Room number</Label>
          {usingOwn ? (
            <div className="flex animate-fade-in flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-tint-2 bg-sky-tint px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-bold text-navy">
                <Home className="size-4 text-accent-blue" /> Your room · {ownRoom}
              </span>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  onChange({ room: "" });
                  setTimeout(() => roomRef.current?.focus(), 0);
                }}
              >
                It&apos;s somewhere else
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                id="room-no"
                ref={roomRef}
                value={draft.room}
                onChange={(e) => onChange({ room: e.target.value })}
                placeholder="e.g. 204"
                maxLength={20}
                disabled={disabled}
                aria-invalid={!!error || undefined}
                autoComplete="off"
              />
              {ownRoom && isOwnHostel && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ room: ownRoom, floor: floorFromRoom(ownRoom) ?? draft.floor })}
                  className="text-xs font-semibold text-accent-blue hover:underline"
                >
                  Use my room ({ownRoom})
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Each room has its own washroom, bathroom and balcony — the room number is enough. Add any detail in your complaint.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="common-area">Which common area?</Label>
            <SimpleSelect
              id="common-area"
              value={draft.area}
              onChange={(area) => onChange({ area, machineId: null })}
              options={HOSTEL_COMMON_AREAS}
              placeholder="Choose common area"
              invalid={!!error}
              disabled={disabled}
            />
          </div>
          {draft.area === "Other" && (
            <div className="animate-fade-in space-y-1.5">
              <Label htmlFor="common-other">Which place?</Label>
              <Input
                id="common-other"
                value={draft.spot}
                onChange={(e) => onChange({ spot: e.target.value })}
                placeholder="e.g. Reading room, terrace, main gate"
                maxLength={100}
                disabled={disabled}
              />
            </div>
          )}
          {draft.area === "Laundry machine" && (
            <div className="animate-fade-in space-y-1.5 rounded-2xl bg-sky-tint p-3">
              <Label htmlFor="machine">Washing machine ID</Label>
              {machines.length > 0 ? (
                <SimpleSelect
                  id="machine"
                  value={draft.machineId}
                  onChange={(machineId) => onChange({ machineId })}
                  options={machines}
                  placeholder="Choose machine ID"
                  noneLabel="I'm not sure which machine"
                  disabled={disabled}
                />
              ) : (
                <p className="text-xs text-slate-600">
                  There are washing machines on New Hostel Ground &amp; 3rd floor and Old Hostel Ground &amp; Basement — choose
                  the right building and floor above to pick the machine.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
