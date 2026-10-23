"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMyWhatsapp } from "@/lib/profile/actions";

export function WhatsappForm({ initialPhone, initialOptIn }: { initialPhone: string; initialOptIn: boolean }) {
  const [phone, setPhone] = useState(initialPhone);
  const [optIn, setOptIn] = useState(initialOptIn);
  const [saved, setSaved] = useState({ phone: initialPhone, optIn: initialOptIn });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateMyWhatsapp(phone, optIn);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPhone(res.phone);
      setSaved({ phone: res.phone, optIn: res.optIn });
      toast.success(res.optIn ? "WhatsApp updates are on." : "WhatsApp settings saved.");
    });
  }

  const unchanged = phone.trim() === saved.phone && optIn === saved.optIn;

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="phone">WhatsApp number</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setError(null);
          }}
          placeholder="+919876543210"
          autoComplete="tel"
          aria-invalid={!!error}
          disabled={pending}
        />
        {error && <p className="text-xs font-medium text-danger-fg">{error}</p>}
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-text">
        <input
          type="checkbox"
          checked={optIn}
          onChange={(e) => setOptIn(e.target.checked)}
          disabled={pending}
          className="size-4 accent-primary"
        />
        Send me ticket updates on WhatsApp
      </label>
      <Button type="submit" disabled={pending || unchanged}>
        {pending ? <Loader2 className="animate-spin" /> : <MessageCircle />} Save WhatsApp settings
      </Button>
    </form>
  );
}
