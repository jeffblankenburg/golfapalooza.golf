import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/**
 * GET /api/v2/music/[id]/listeners — who played (with play count + last played)
 * and who liked a song. Powers the expandable listeners panel in the Music admin.
 * Requires manage_music (or org admin) on the song's org.
 */
interface ProfileRef {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const { data: song } = await admin.from("v2_songs").select("org_id").eq("id", id).maybeSingle();
  if (!song) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await hasPermission(admin, userId, song.org_id, "manage_music"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const [playsRes, likesRes] = await Promise.all([
    admin.from("v2_song_plays").select("user_id, played_at").eq("song_id", id),
    admin
      .from("v2_song_favorites")
      .select("user_id, created_at, profile:v2_profiles(id, display_name, avatar_url)")
      .eq("song_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Aggregate plays per user (count + most recent).
  const byUser = new Map<string, { count: number; last: string }>();
  for (const p of playsRes.data || []) {
    const cur = byUser.get(p.user_id);
    if (!cur) byUser.set(p.user_id, { count: 1, last: p.played_at });
    else {
      cur.count += 1;
      if (p.played_at > cur.last) cur.last = p.played_at;
    }
  }

  // Resolve player profiles.
  const playerIds = [...byUser.keys()];
  const profById = new Map<string, ProfileRef>();
  if (playerIds.length) {
    const { data: profs } = await admin.from("v2_profiles").select("id, display_name, avatar_url").in("id", playerIds);
    for (const p of profs || []) profById.set(p.id, p as ProfileRef);
  }

  const plays = playerIds
    .map((uid) => {
      const agg = byUser.get(uid)!;
      const p = profById.get(uid);
      return {
        user_id: uid,
        display_name: p?.display_name || "Member",
        avatar_url: p?.avatar_url ?? null,
        count: agg.count,
        last_played_at: agg.last,
      };
    })
    .sort((a, b) => (a.last_played_at < b.last_played_at ? 1 : -1));

  const likes = (likesRes.data || []).map((l) => {
    const p = (Array.isArray(l.profile) ? l.profile[0] : l.profile) as ProfileRef | null;
    return {
      user_id: l.user_id,
      display_name: p?.display_name || "Member",
      avatar_url: p?.avatar_url ?? null,
      created_at: l.created_at,
    };
  });

  return NextResponse.json({ plays, likes });
}
