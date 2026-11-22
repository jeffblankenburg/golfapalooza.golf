import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { loadMembersDirectory } from "@/lib/v2/members-directory";

/**
 * GET /api/v2/members?orgId= — the full member directory (grid / tree). Org-gated.
 * The server page hydrates with the same loader, so this is the live-refresh path.
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

  const members = await loadMembersDirectory(admin, orgId);
  return NextResponse.json({ members });
}
