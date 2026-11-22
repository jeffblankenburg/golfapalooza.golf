import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";
import { coarsenLocation } from "@/lib/v2/geo";

/**
 * GET /api/v2/members/locations?orgId= — org members for the directory Map view,
 * at the precision each member chose via `map_visibility`. 'off' members are
 * excluded entirely; 'city'/'state' are coarsened so a precise home point is never
 * exposed. Shape matches LoozerMap
 * (`{ loozers: [{ id, display_name, avatar_url, city, state, latitude, longitude }] }`).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const [{ data: rows }, mode] = await Promise.all([
    admin
      .from("v2_memberships")
      .select("member:v2_profiles(id, display_name, first_name, last_name, avatar_url, city, state, latitude, longitude, map_visibility)")
      .eq("org_id", orgId)
      .eq("status", "active"),
    orgNameMode(admin, orgId),
  ]);

  const loozers = (rows || [])
    .map((r) => (Array.isArray(r.member) ? r.member[0] : r.member))
    .map((p) => {
      if (!p) return null;
      // Honor the member's chosen precision — never emit a point below their level.
      const at = coarsenLocation(
        p.map_visibility as string | null,
        p.latitude as number | null,
        p.longitude as number | null,
        p.state as string | null,
      );
      if (!at) return null;
      return {
        id: p.id as string,
        display_name: pickName(p, mode),
        avatar_url: (p.avatar_url as string | null) ?? null,
        // State-level pins show state only; city/address may show the city label.
        city: at.precision === "state" ? null : ((p.city as string | null) ?? null),
        state: (p.state as string | null) ?? null,
        latitude: at.lat,
        longitude: at.lng,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ loozers });
}
