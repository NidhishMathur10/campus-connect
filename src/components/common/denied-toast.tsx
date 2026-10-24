"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/** Shows "Not allowed" once after a redirect from a page the role may not open (`?denied=1`), then cleans the URL. */
export function DeniedToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const denied = params.get("denied") === "1";

  useEffect(() => {
    if (!denied) return;
    toast.error("Not allowed. That page isn't available for your role.");
    const next = new URLSearchParams(params.toString());
    next.delete("denied");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [denied, params, pathname, router]);

  return null;
}
