import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME, type Role } from "@/config/roles";
import type { Profile } from "@/lib/types";

/** The signed-in user's profile, or null. Cached for the duration of one request. */
export const getCurrentProfile = cache(
  async (): Promise<{ userId: string | null; profile: Profile | null }> => {
    const supabase = await createClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = claimsData?.claims?.sub ?? null;
    if (!userId) return { userId: null, profile: null };

    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    return { userId, profile: (data as Profile | null) ?? null };
  },
);

/** Use at the top of a page/layout. Redirects if signed out or wrong role. */
export async function requireProfile(roles?: Role[]): Promise<Profile> {
  const { userId, profile } = await getCurrentProfile();
  if (!userId) redirect("/login");
  // Signed in but no profile row (e.g. schema.sql was run after the user was created).
  if (!profile) redirect("/account-issue");
  if (roles && !roles.includes(profile.role)) redirect(ROLE_HOME[profile.role]);
  return profile;
}
