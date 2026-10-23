"use server";

import { revalidatePath } from "next/cache";
import { collegeEmailDomain, collegeEmailError, isCollegeEmail, normaliseEmail } from "@/config/email";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type UpdateEmailResult = { ok: true; email: string } | { ok: false; error: string };

/** Any signed-in user can change their own notification address (college domain only). */
export async function updateMyEmail(input: string): Promise<UpdateEmailResult> {
  const { profile } = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Please log in again." };

  const domain = collegeEmailDomain();
  if (!isCollegeEmail(input, domain)) return { ok: false, error: collegeEmailError(domain) };
  const email = normaliseEmail(input);

  const admin = createAdminClient();
  const { data: taken } = await admin.from("profiles").select("id").eq("email", email).neq("id", profile.id).maybeSingle();
  if (taken) return { ok: false, error: "That college email is already used by another account." };

  const { error } = await admin.from("profiles").update({ email }).eq("id", profile.id);
  if (error) {
    console.error("[updateMyEmail]", error.message);
    return { ok: false, error: "Could not save your email. Please try again." };
  }
  revalidatePath("/profile");
  return { ok: true, email };
}
