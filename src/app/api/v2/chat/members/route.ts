import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * GET /api/v2/chat/members?orgId= — active org members (excluding the caller),
 * for starting a new DM/group. Auth: bearer/cookie; org-membership gated.
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

  const { data } = await admin
    .from("v2_memberships")
    .select("user_id, member:v2_profiles(display_name, avatar_url)")
    .eq("org_id", orgId)
    .eq("status", "active");

  const members = (data || [])
    .filter((m) => m.user_id !== userId)
    .map((m) => {
      const p = Array.isArray(m.member) ? m.member[0] : m.member;
      return {
        userId: m.user_id as string,
        displayName: (p?.display_name as string) || "Member",
        avatarUrl: (p?.avatar_url as string | null) ?? null,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return NextResponse.json({ members });
}
