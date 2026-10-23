"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { closeMyItem } from "@/lib/lost-found/actions";

/** The owner of a lost report closes it once they have the item back. */
export function CloseLostButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await closeMyItem(itemId);
          if (!res.ok) toast.error(res.error);
          else {
            toast.success("Marked as found. Glad you got it back!");
            router.refresh();
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <CheckCheck />} I got it back
    </Button>
  );
}
