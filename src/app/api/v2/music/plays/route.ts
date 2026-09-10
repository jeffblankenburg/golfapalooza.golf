import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * POST /api/v2/music/plays { orgId, songId } — record a play (fired ~10s into a
 * track by the player). Best-effort analytics. Auth: bearer/cookie; org-gated.
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; songId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.orgId || !body.songId) {
    return NextResponse.json({ error: "orgId and songId required" }, { status: 400 });
  }

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, body.orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { error } = await admin
    .from("v2_song_plays")
    .insert({ user_id: userId, song_id: body.songId });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
