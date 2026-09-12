import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Al Pine" — the platform's system personality. A single global v2_profile
 * (is_system = true) reused as the author of automated/generic content:
 * announcements sent "as Al Pine", birthday wishes, etc. Mirrors the legacy
 * is_system user (scripts/create-al-pine.mjs); the v2 profile reuses the same
 * auth identity (provisioned in migration 00216).
 */

export interface SystemProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

/** The system profile, or null if it hasn't been provisioned. */
export async function getSystemProfile(admin: SupabaseClient): Promise<SystemProfile | null> {
  const { data } = await admin
    .from("v2_profiles")
    .select("id, display_name, avatar_url")
    .eq("is_system", true)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** Just the system profile's id (for FK/actor fields), or null. */
export async function getSystemProfileId(admin: SupabaseClient): Promise<string | null> {
  return (await getSystemProfile(admin))?.id ?? null;
}
