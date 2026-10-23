import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/college";

/** Our mark: a navy chat bubble with a check, overlapped by a sky-blue ring. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" className={cn("size-9", className)}>
      <circle cx="27" cy="14" r="9.5" stroke="#3B82F6" strokeWidth="3" opacity="0.9" />
      <path
        d="M6 13.5C6 9.36 9.36 6 13.5 6h7C24.64 6 28 9.36 28 13.5v5c0 4.14-3.36 7.5-7.5 7.5H15l-6.2 5.3c-.65.55-1.6.09-1.6-.75V25.2A7.48 7.48 0 0 1 6 21.5v-8Z"
        fill="#0F172A"
      />
      <path
        d="m11.5 16.2 3.4 3.3 6.6-6.6"
        stroke="#fff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {showText && (
        <span className="text-lg font-extrabold tracking-tight text-navy">{APP_NAME}</span>
      )}
    </span>
  );
}
