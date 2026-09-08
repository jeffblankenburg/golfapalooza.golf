import { v2ServerClient } from "@/lib/v2/supabase";

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
  role: OrgRole;
}

export interface PlatformContext {
  userId: string;
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

  const { data: memberships } = await supabase
    .from("v2_memberships")
    .select(
      "role, org:v2_organizations(id, name, slug, logo_url, primary_color, secondary_color)"
    )
    .eq("user_id", user.id)
    .eq("status", "active");

  const orgs: PlatformOrg[] = (memberships || [])
    .map((m) => {
      const o = Array.isArray(m.org) ? m.org[0] : m.org;
      if (!o) return null;
      return { ...(o as Omit<PlatformOrg, "role">), role: m.role as OrgRole };
    })
    .filter((o): o is PlatformOrg => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { userId: user.id, orgs };
}
