import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * Favorites on a song.
 *   POST   { orgId, songId } — favorite (idempotent).
 *   DELETE { orgId, songId } — un-favorite.
 * Auth: bearer/cookie; org-gated.
 */
async function resolve(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 as const };

  let body: { orgId?: string; songId?: string };
  try {
    body = await request.json();
  } catch {
    return { error: "Invalid body", status: 400 as const };
  }
  if (!body.orgId || !body.songId) return { error: "orgId and songId required", status: 400 as const };

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, body.orgId))) {
    return { error: "Not a member", status: 403 as const };
  }
  return { admin, userId, songId: body.songId };
}

export async function POST(request: Request) {
  const r = await resolve(request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const { error } = await r.admin
    .from("v2_song_favorites")
    .upsert({ user_id: r.userId, song_id: r.songId }, { onConflict: "user_id,song_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const r = await resolve(request);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });

  const { error } = await r.admin
    .from("v2_song_favorites")
    .delete()
    .eq("user_id", r.userId)
    .eq("song_id", r.songId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
