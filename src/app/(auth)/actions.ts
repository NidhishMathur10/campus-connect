"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginIdToEmail } from "@/config/college";
import { collegeEmailDomain, collegeEmailError, isCollegeEmail, normaliseEmail } from "@/config/email";
import { HOSTELS } from "@/config/locations";
import { isRole, ROLE_HOME } from "@/config/roles";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Echo of submitted (non-secret) values so the form can refill after an error. */
  values?: Record<string, string>;
}

function safeNext(next: unknown): string | null {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const loginId = String(formData.get("loginId") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const values = { loginId };
  if (!loginId || !password) {
    return { error: "Enter your roll number (or staff ID) and password.", values };
  }

  let home: string;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(loginId),
      password,
    });
    if (error || !data.user) {
      return { error: "Wrong roll number / staff ID or password.", values };
    }
    const role = data.user.app_metadata?.role;
    home = ROLE_HOME[isRole(role) ? role : "student"];
  } catch (err) {
    console.error("[signIn]", err);
    return { error: "Could not reach the login server. Check your Supabase settings.", values };
  }

  // Go back to the page they wanted (if any); the proxy bounces them home if their role can't see it.
  redirect(safeNext(formData.get("next")) ?? home);
}

const SignUpSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name").max(80),
    rollNo: z
      .string()
      .trim()
      .regex(/^[0-9A-Za-z]{5,15}$/, "Roll number should be 5–15 letters/digits, no spaces"),
    hostel: z.enum(Object.keys(HOSTELS) as [keyof typeof HOSTELS, ...(keyof typeof HOSTELS)[]], {
      message: "Choose your hostel",
    }),
    wing: z.string().min(1, "Choose your wing"),
    room: z.string().trim().min(1, "Enter your room number").max(20),
    email: z.string().trim().min(1, "Enter your college email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirm: z.string(),
  })
  .refine((v) => isCollegeEmail(v.email, collegeEmailDomain()), {
    path: ["email"],
    message: collegeEmailError(collegeEmailDomain()),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" })
  .refine((v) => (HOSTELS[v.hostel] as readonly string[]).includes(v.wing), {
    path: ["wing"],
    message: "That wing doesn't exist in this hostel",
  });

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = {
    fullName: raw.fullName ?? "",
    rollNo: raw.rollNo ?? "",
    email: raw.email ?? "",
    hostel: raw.hostel ?? "",
    wing: raw.wing ?? "",
    room: raw.room ?? "",
  };
  const fail = (error: string, fieldErrors?: Record<string, string>): FormState => ({
    error,
    fieldErrors,
    values,
  });

  const parsed = SignUpSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return fail("Please fix the highlighted fields.", fieldErrors);
  }
  const v = parsed.data;
  const rollNo = v.rollNo.toLowerCase();

  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("roll_no", rollNo)
      .maybeSingle();
    if (existing) return fail("An account with this roll number already exists. Try logging in.");
    const email = normaliseEmail(v.email);
    const { data: emailTaken } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
    if (emailTaken) return fail("That college email is already used by another account.", { email: "Already in use" });

    // Created server-side with the service role so the account is confirmed instantly
    // and the role is locked to "student" (app_metadata can't be set by users).
    const { error: createError } = await admin.auth.admin.createUser({
      email: loginIdToEmail(rollNo),
      password: v.password,
      email_confirm: true,
      user_metadata: {
        full_name: v.fullName,
        roll_no: rollNo,
        hostel: v.hostel,
        wing: v.wing,
        room: v.room,
      },
      app_metadata: { role: "student" },
    });
    if (createError) {
      return fail(
        createError.message.includes("already")
          ? "An account with this roll number already exists. Try logging in."
          : `Could not create account: ${createError.message}`,
      );
    }

    // Contact address for notifications (the login itself stays roll-number based).
    const { error: emailError } = await admin.from("profiles").update({ email }).eq("roll_no", rollNo);
    if (emailError) console.error("[signUp] could not save email:", emailError.message);

    const supabase = await createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: loginIdToEmail(rollNo),
      password: v.password,
    });
    if (loginError) return { error: "Account created, but auto-login failed. Please log in." };
  } catch (err) {
    console.error("[signUp]", err);
    return fail("Could not reach the server. Check your Supabase settings in .env.local.");
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
