import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * GET /api/v2/music?orgId= — the org's song catalog (sort_order, then title),
 * each flagged with the caller's is_favorite. Auth: bearer/cookie; org-gated.
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

  const [{ data: songs, error }, { data: favorites }] = await Promise.all([
    admin
      .from("v2_songs")
      .select(
        "id, title, mp3_url, art_url, art_thumb_url, lyrics, duration_seconds, sort_order, tagged_user:v2_profiles!v2_songs_tagged_user_id_fkey(id, display_name, first_name, last_name, avatar_url)",
      )
      .eq("org_id", orgId)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    admin.from("v2_song_favorites").select("song_id").eq("user_id", userId),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const favIds = new Set((favorites || []).map((f) => f.song_id));
  const withFav = (songs || []).map((s) => {
    const tagged = Array.isArray(s.tagged_user) ? s.tagged_user[0] ?? null : s.tagged_user ?? null;
    return { ...s, tagged_user: tagged, is_favorite: favIds.has(s.id) };
  });

  return NextResponse.json({ songs: withFav });
}
