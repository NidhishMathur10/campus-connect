"use client";

import { useState, useTransition } from "react";
import { Building2, Loader2, Palmtree, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BUILDINGS } from "@/config/locations";
import { setDepartmentAutoAssign, setPreferredBuildings, setReassignManual, setStaffOnLeave } from "@/lib/assignment-actions";
import type { AssignmentSettings } from "@/lib/assignment";
import type { DirectoryDepartment, DirectoryStaff } from "@/lib/staff-directory";
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; error: string };

function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  function run(key: string, fn: () => Promise<Result>, success: string) {
    setBusy(key);
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) toast.success(success);
        else toast.error(res.error);
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setBusy(null);
      }
    });
  }
  return { busy, run };
}

function Switch({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors disabled:opacity-50",
        on ? "bg-primary" : "bg-surface-2",
      )}
    >
      <span className={cn("block size-4.5 rounded-full bg-surface shadow transition-transform", on ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}

function StaffRow({ s }: { s: DirectoryStaff }) {
  const { busy, run } = useAction();
  const [picked, setPicked] = useState<string[]>(s.preferred_buildings);
  const [editing, setEditing] = useState(false);
  const dirty = picked.slice().sort().join("|") !== s.preferred_buildings.slice().sort().join("|");

  return (
    <li className="space-y-2 rounded-2xl border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-bold text-text">
            {s.full_name}
            {s.on_leave && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-bold text-warning-fg">
                <Palmtree className="size-3" /> On leave
              </span>
            )}
          </p>
          <p className="text-xs text-text-muted">
            {s.openTickets} open ticket{s.openTickets === 1 ? "" : "s"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-text-muted">
          On leave
          <Switch
            on={s.on_leave}
            disabled={busy === "leave"}
            label={`${s.full_name} on leave`}
            onClick={() =>
              run("leave", () => setStaffOnLeave(s.id, !s.on_leave), s.on_leave ? `${s.full_name} is back` : `${s.full_name} is on leave — new tickets skip them`)
            }
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <Building2 className="size-3.5 text-text-muted" />
        {s.preferred_buildings.length === 0 ? (
          <span className="text-text-muted">No preferred buildings (covers everywhere)</span>
        ) : (
          s.preferred_buildings.map((b) => (
            <span key={b} className="rounded-full bg-info-bg px-2 py-0.5 font-semibold text-info-fg">
              {b}
            </span>
          ))
        )}
        <button type="button" className="ml-1 font-semibold text-accent-text hover:underline" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing && (
        <div className="space-y-2 rounded-2xl bg-surface-2 p-3">
          <div className="flex flex-wrap gap-1.5">
            {BUILDINGS.map((b) => {
              const on = picked.includes(b);
              return (
                <button
                  key={b}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== b) : [...p, b]))}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-text-muted hover:bg-surface-2",
                  )}
                >
                  {b}
                </button>
              );
            })}
          </div>
          <Button
            size="sm"
            disabled={!dirty || busy === "buildings"}
            onClick={() => run("buildings", () => setPreferredBuildings(s.id, picked), "Preferred buildings saved")}
          >
            {busy === "buildings" && <Loader2 className="animate-spin" />} Save buildings
          </Button>
        </div>
      )}
    </li>
  );
}

export function DirectoryView({
  departments,
  settings,
  isWarden,
}: {
  departments: DirectoryDepartment[];
  settings: AssignmentSettings;
  isWarden: boolean;
}) {
  const { busy, run } = useAction();
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border bg-surface p-4 shadow-sm sm:p-5">
        <div className="max-w-xl">
          <p className="eyebrow">Auto re-assign manual assignments</p>
          <p className="text-sm text-text-muted">
            When on, tickets assigned by hand are also moved to the next person if the deadline is missed. When off they only get a reminder.
            {!isWarden && " Only the warden can change this."}
          </p>
        </div>
        <Switch
          on={settings.reassignManual}
          disabled={!isWarden || busy === "manual"}
          label="Auto re-assign manual assignments"
          onClick={() => run("manual", () => setReassignManual(!settings.reassignManual), "Setting saved")}
        />
      </section>

      {departments.map((d) => (
        <section key={d.department} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-text">
              <Users className="size-4 text-text-muted" /> {d.department}
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-text-muted">{d.staff.length}</span>
            </h2>
            <label className="flex items-center gap-2 text-xs font-semibold text-text-muted">
              Auto-assign
              <Switch
                on={d.autoAssign}
                disabled={!isWarden || busy === d.department}
                label={`Auto-assign for ${d.department}`}
                onClick={() =>
                  run(d.department, () => setDepartmentAutoAssign(d.department, !d.autoAssign), `Auto-assign ${d.autoAssign ? "off" : "on"} for ${d.department}`)
                }
              />
            </label>
          </div>
          <ul className="grid gap-2.5 md:grid-cols-2">
            {d.staff.map((s) => (
              <StaffRow key={s.id} s={s} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
