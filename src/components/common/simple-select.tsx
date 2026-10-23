"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NONE = "__none__";

/** Thin wrapper over shadcn Select for plain string options. `null` = nothing chosen. */
export function SimpleSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  noneLabel,
  disabled,
  invalid,
  className,
  labels,
}: {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: readonly string[];
  placeholder: string;
  /** When set, adds a first option that clears the value. */
  noneLabel?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** Display text per option value (default: the value itself). */
  labels?: Record<string, string>;
}) {
  return (
    <Select
      value={value ?? (noneLabel ? NONE : "")}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-72">
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {labels?.[o] ?? o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
