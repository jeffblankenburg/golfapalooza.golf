import { v2ServerClient, v2AdminClient } from "@/lib/v2/supabase";
import { resolveEffectiveUser } from "@/lib/v2/simulator";
import type { NameMode } from "@/lib/v2/profile";

/**
 * Platform context for the /new web app (server components). Native clients read
 * the same data via the Supabase SDK under identical RLS.
 */

export type OrgRole = "owner" | "admin" | "member";

export interface PlatformOrg {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  store_url: string | null;
  store_label: string | null;
  store_enabled: boolean;
  name_display: NameMode;
  system_name: string | null;
  system_avatar_url: string | null;
  member_noun: string;
  member_noun_plural: string;
  show_birthdays: boolean;
  role: OrgRole;
}

export interface PlatformContext {
  /** Effective user — the simulated member when simulating, else the real user. */
  userId: string;
  /** The authenticated user (differs from userId only while simulating). */
  realUserId: string;
  /** True when viewing the app as another member via the simulator. */
  simulating: boolean;
  /** Display name of the simulated member (only while simulating). */
  simName: string | null;
  orgs: PlatformOrg[];
}

/**
 * The signed-in user and the organizations they belong to, or null if not
 * authenticated. Uses the RLS-respecting cookie client so the v2 policies are
 * exercised end-to-end (a user only sees their own memberships/orgs).
 */
export async function getPlatformContext(): Promise<PlatformContext | null> {
  const supabase = await v2ServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const eff = await resolveEffectiveUser(user.id);
  const effUserId = eff.userId ?? user.id;
  // When simulating, the RLS client can't read the simulated member's own rows —
  // fetch their memberships with the service-role client instead.
  const client = eff.simulating ? v2AdminClient() : supabase;

  const { data: memberships } = await client
    .from("v2_memberships")
    .select(
      "role, org:v2_organizations(id, name, slug, logo_url, primary_color, secondary_color, store_url, store_label, store_enabled, name_display, system_name, system_avatar_url, member_noun, member_noun_plural, show_birthdays)"
    )
    .eq("user_id", effUserId)
    .eq("status", "active")
    .is("archived_at", null);

  const orgs: PlatformOrg[] = (memberships || [])
    .map((m) => {
      const o = Array.isArray(m.org) ? m.org[0] : m.org;
      if (!o) return null;
      return { ...(o as Omit<PlatformOrg, "role">), role: m.role as OrgRole };
    })
    .filter((o): o is PlatformOrg => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  let simName: string | null = null;
  if (eff.simulating) {
    const { data: prof } = await client.from("v2_profiles").select("display_name").eq("id", effUserId).maybeSingle();
    simName = prof?.display_name ?? null;
  }

  return { userId: effUserId, realUserId: user.id, simulating: eff.simulating, simName, orgs };
}
