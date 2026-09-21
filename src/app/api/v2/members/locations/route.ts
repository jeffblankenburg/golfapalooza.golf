import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * GET /api/v2/members/locations?orgId= — org members who have a geocoded
 * location, for the directory Map view. Shape matches what LoozerMap expects
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
      .select("member:v2_profiles(id, display_name, first_name, last_name, avatar_url, city, state, latitude, longitude)")
      .eq("org_id", orgId)
      .eq("status", "active"),
    orgNameMode(admin, orgId),
  ]);

  const loozers = (rows || [])
    .map((r) => (Array.isArray(r.member) ? r.member[0] : r.member))
    .filter((p) => p && p.latitude != null && p.longitude != null)
    .map((p) => ({
      id: p!.id as string,
      display_name: pickName(p, mode),
      avatar_url: (p!.avatar_url as string | null) ?? null,
      city: (p!.city as string | null) ?? null,
      state: (p!.state as string | null) ?? null,
      latitude: p!.latitude as number,
      longitude: p!.longitude as number,
    }));

  return NextResponse.json({ loozers });
}
