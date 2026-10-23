"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { collegeEmailError, defaultStudentEmail, isCollegeEmail } from "@/config/email";
import { HOSTELS, type Hostel } from "@/config/locations";
import { signUp, type FormState } from "../actions";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-medium text-danger-fg">{message}</p> : null;
}

export function SignupForm({ emailDomain }: { emailDomain: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(signUp, {});
  const [rollNo, setRollNo] = useState("");
  // Pre-filled as <roll number>@<domain> until the student edits it.
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [hostel, setHostel] = useState<Hostel | "">("");
  const [wing, setWing] = useState("");
  const fe = state.fieldErrors ?? {};
  const v = state.values ?? {};
  const wings = hostel ? HOSTELS[hostel] : [];
  const shownEmailError = emailError ?? fe.email;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!isCollegeEmail(email, emailDomain)) {
      e.preventDefault();
      setEmailError(collegeEmailError(emailDomain));
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <p className="eyebrow">Students only</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl">Create your account</h1>
        <p className="text-sm text-text-muted">Your roll number will be your username.</p>
      </div>

      <form action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" name="fullName" defaultValue={v.fullName} key={`n${v.fullName}`} autoComplete="name" required aria-invalid={!!fe.fullName} />
          <FieldError message={fe.fullName} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rollNo">Roll number</Label>
          <Input
            id="rollNo"
            name="rollNo"
            value={rollNo}
            onChange={(e) => {
              setRollNo(e.target.value);
              if (!emailTouched) setEmail(defaultStudentEmail(e.target.value, emailDomain));
            }}
            inputMode="numeric"
            placeholder="e.g. 2616400155"
            required
            aria-invalid={!!fe.rollNo}
          />
          <FieldError message={fe.rollNo} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">College email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailTouched(true);
              setEmailError(null);
            }}
            autoComplete="email"
            placeholder={`yourrollno@${emailDomain}`}
            required
            aria-invalid={!!shownEmailError}
          />
          {shownEmailError ? (
            <FieldError message={shownEmailError} />
          ) : (
            <p className="text-xs text-text-muted">We send ticket updates here. Must end with @{emailDomain}.</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Hostel</Label>
            <input type="hidden" name="hostel" value={hostel} />
            <Select
              value={hostel}
              onValueChange={(v) => {
                const h = v as Hostel;
                setHostel(h);
                setWing(HOSTELS[h].length === 1 ? HOSTELS[h][0] : "");
              }}
            >
              <SelectTrigger className="w-full" aria-invalid={!!fe.hostel}>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(HOSTELS) as Hostel[]).map((h) => (
                  <SelectItem key={h} value={h}>{h}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fe.hostel} />
          </div>
          <div className="space-y-2">
            <Label>Wing</Label>
            <input type="hidden" name="wing" value={wing} />
            <Select value={wing} onValueChange={setWing} disabled={!hostel}>
              <SelectTrigger className="w-full" aria-invalid={!!fe.wing}>
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {wings.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={fe.wing} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="room">Room</Label>
            <Input id="room" name="room" defaultValue={v.room} key={`m${v.room}`} placeholder="e.g. 214" required aria-invalid={!!fe.room} />
            <FieldError message={fe.room} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" autoComplete="new-password" required aria-invalid={!!fe.password} />
            <FieldError message={fe.password} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!fe.confirm} />
            <FieldError message={fe.confirm} />
          </div>
        </div>

        {state.error && (
          <p role="alert" className="rounded-2xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
            {state.error}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {pending ? "Creating account…" : "Create account"}
        </Button>
        <p className="text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-bold text-accent-text hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
