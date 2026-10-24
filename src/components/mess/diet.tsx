import type { DietType, MenuItem } from "@/config/mess";
import { cn } from "@/lib/utils";

/** Indian-style food mark: outlined square with a dot. Green = veg, red = non-veg, split = either. */
export function DietDot({ type, className }: { type: DietType; className?: string }) {
  const label = type === "veg" ? "Vegetarian" : type === "nonveg" ? "Non-vegetarian" : "Veg or non-veg";
  const colour = type === "veg" ? "border-success-solid" : type === "nonveg" ? "border-danger-solid" : "border-text-muted";
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-grid size-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px]", colour, className)}>
      {type === "either" ? (
        <span className="size-2 rounded-full bg-[linear-gradient(90deg,var(--success-solid)_50%,var(--danger-solid)_50%)]" />
      ) : (
        <span className={cn("size-2 rounded-full", type === "veg" ? "bg-success-solid" : "bg-danger-solid")} />
      )}
    </span>
  );
}

export function DietLegend({ className }: { className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-text-muted", className)}>
      <span className="inline-flex items-center gap-1.5"><DietDot type="veg" /> Veg</span>
      <span className="inline-flex items-center gap-1.5"><DietDot type="nonveg" /> Non-veg</span>
      <span>“A / B” = choose one</span>
    </p>
  );
}

/** One dish line: dot + name, plus "/ alternative" with its own dot. `t` maps a name to its display text (Hindi). */
export function ItemLine({ item, t = (n) => n, className }: { item: MenuItem; t?: (name: string) => string; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}>
      <DietDot type={item.type} />
      <span>{t(item.name)}</span>
      {item.alt && (
        <>
          <span className="text-text-muted">/</span>
          <DietDot type={item.alt_type ?? "veg"} />
          <span>{t(item.alt)}</span>
        </>
      )}
    </span>
  );
}
