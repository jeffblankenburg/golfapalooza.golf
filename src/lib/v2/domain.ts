import { v2AdminClient } from "@/lib/v2/supabase";

/**
 * Custom-domain → organization resolution for the /new app. Orgs can point their
 * own hostname at this app; we identify the org from the request Host header and
 * skin the UI (name/logo/colors), including for logged-out visitors. Uses the
 * service-role client so it works with no session; the rows are public-readable.
 */

export interface OrgBranding {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

// Platform-default hosts (path-based org selection), NOT tenant custom domains.
const DEFAULT_HOSTS = new Set([
  "golfapalooza.golf",
  "www.golfapalooza.golf",
  "localhost",
  "localhost:3000",
  "127.0.0.1",
  "127.0.0.1:3000",
]);

export function isDefaultHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const h = host.toLowerCase();
  return DEFAULT_HOSTS.has(h) || h.endsWith(".vercel.app");
}

/**
 * Resolve the org that owns a custom hostname, or null for the default/unmapped
 * host. Only `verified` domains skin the app, so a pending-DNS domain can't
 * hijack another org's branding.
 */
export async function resolveOrgByHost(
  host: string | null | undefined
): Promise<OrgBranding | null> {
  if (isDefaultHost(host)) return null;
  const admin = v2AdminClient();
  const { data } = await admin
    .from("v2_org_domains")
    .select(
      "org:v2_organizations(id, name, slug, logo_url, primary_color, secondary_color)"
    )
    .eq("hostname", host!.toLowerCase())
    .eq("verified", true)
    .maybeSingle();

  if (!data?.org) return null;
  const org = Array.isArray(data.org) ? data.org[0] : data.org;
  return (org as OrgBranding) ?? null;
}
