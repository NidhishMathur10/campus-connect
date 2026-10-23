"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { collegeEmailError, isCollegeEmail } from "@/config/email";
import { updateMyEmail } from "@/lib/profile/actions";

export function EmailForm({ initialEmail, domain }: { initialEmail: string; domain: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [saved, setSaved] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isCollegeEmail(email, domain)) {
      setError(collegeEmailError(domain));
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateMyEmail(email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail(res.email);
      setSaved(res.email);
      toast.success("Email updated.");
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          placeholder={`name@${domain}`}
          autoComplete="email"
          aria-invalid={!!error}
          disabled={pending}
        />
        {error && <p className="text-xs font-medium text-red-700">{error}</p>}
        {!saved && !error && (
          <p className="text-xs font-medium text-amber-700">No email saved yet, so you will not get email updates.</p>
        )}
      </div>
      <Button type="submit" disabled={pending || email.trim().toLowerCase() === saved}>
        {pending ? <Loader2 className="animate-spin" /> : <Mail />} Save email
      </Button>
    </form>
  );
}
