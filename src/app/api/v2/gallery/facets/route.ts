import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * GET /api/v2/gallery/facets?orgId= — filter options for the gallery: available
 * years (from item dates) and the Loozers who are tagged in any photo.
 * Auth: bearer/cookie; org-membership gated.
 */
export async function GET(request: Request) {
  const orgId = new URL(request.url).searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: items } = await admin
    .from("v2_gallery_items")
    .select("id, sort_date")
    .eq("org_id", orgId);
  const rows = items || [];

  const years = [...new Set(rows.map((r) => new Date(r.sort_date).getFullYear()))]
    .filter((y) => Number.isFinite(y))
    .sort((a, b) => b - a);

  // Tagged Loozers among this org's items.
  const itemIds = rows.map((r) => r.id);
  let taggedUsers: { userId: string; displayName: string }[] = [];
  if (itemIds.length) {
    const { data: tags } = await admin
      .from("v2_gallery_tags")
      .select("tagged_user_id, tagged:v2_profiles!v2_gallery_tags_tagged_user_id_fkey(display_name)")
      .in("item_id", itemIds);
    const seen = new Map<string, string>();
    for (const t of tags || []) {
      const p = Array.isArray(t.tagged) ? t.tagged[0] : t.tagged;
      if (!seen.has(t.tagged_user_id)) seen.set(t.tagged_user_id, p?.display_name || "Member");
    }
    taggedUsers = [...seen.entries()]
      .map(([userId, displayName]) => ({ userId, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  return NextResponse.json({ years, taggedUsers });
}
