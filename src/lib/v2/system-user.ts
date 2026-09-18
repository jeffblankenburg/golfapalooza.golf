import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-org "system identity" — the presented author of automated/generic content
 * (announcements sent "as the system", future bot posts). Each org names its own
 * entity; the default is the generic "System". Golfapalooza uses "Al Pine".
 *
 * Stored on v2_organizations (system_name / system_avatar_url) rather than a
 * v2_profile, because v2_profiles.id FKs auth.users — there's no clean way to
 * mint one system profile per tenant. See migration 00223.
 */

export interface SystemIdentity {
  name: string;
  avatar_url: string | null;
}

const DEFAULT_SYSTEM_NAME = "System";

/** The org's system identity (name + avatar), with a safe generic default. */
export async function getOrgSystemIdentity(
  admin: SupabaseClient,
  orgId: string,
): Promise<SystemIdentity> {
  const { data } = await admin
    .from("v2_organizations")
    .select("system_name, system_avatar_url")
    .eq("id", orgId)
    .maybeSingle();
  return {
    name: data?.system_name?.trim() || DEFAULT_SYSTEM_NAME,
    avatar_url: data?.system_avatar_url ?? null,
  };
}
