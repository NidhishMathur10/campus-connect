"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BadgeCheck, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deleteNotice, resolveNotice } from "@/lib/notices/actions";

/** Edit / resolve (known issues) / delete for the author (or the Dean). */
export function PosterActions({
  id,
  title,
  canResolve,
  followers,
}: {
  id: string;
  title: string;
  canResolve: boolean;
  followers: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState("");

  function resolve() {
    start(async () => {
      const res = await resolveNotice(id, note);
      if (!res.ok) return void toast.error(res.error);
      toast.success(followers > 0 ? `Marked resolved. ${followers} follower${followers === 1 ? "" : "s"} notified.` : "Marked resolved.");
      setResolving(false);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(`Delete "${title}"? Students will no longer see it. This cannot be undone.`)) return;
    start(async () => {
      const res = await deleteNotice(id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Notice deleted.");
      router.push("/notices");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href={`/notices/${id}/edit`}><Pencil /> Edit</Link>
        </Button>
        {canResolve && !resolving && (
          <Button onClick={() => setResolving(true)} disabled={pending}>
            <BadgeCheck /> Mark resolved
          </Button>
        )}
        <Button variant="outline" onClick={remove} disabled={pending} className="text-danger-fg">
          {pending && !resolving ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
        </Button>
      </div>
      {resolving && (
        <div className="space-y-2 rounded-2xl border border-border bg-surface-2 p-4">
          <p className="text-sm font-bold text-text">
            {followers > 0 ? `${followers} student${followers === 1 ? "" : "s"} following this will be notified.` : "Nobody is following this yet."}
          </p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Water supply restored. Thanks for your patience." className="min-h-20" maxLength={500} />
          <div className="flex gap-2">
            <Button onClick={resolve} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Confirm resolved
            </Button>
            <Button variant="outline" onClick={() => setResolving(false)} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
