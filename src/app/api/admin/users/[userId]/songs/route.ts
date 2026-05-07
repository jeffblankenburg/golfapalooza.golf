import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnyPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/users/{userId}/songs:
 *   get:
 *     summary: List a user's song play history aggregated per song (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Per-song play counts and last-played timestamps for the user.
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await checkAnyPermissionAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const supabase = createAdminClient();

  const { data: plays, error } = await supabase
    .from("song_plays")
    .select("song_id, song:songs(id, title, art_url)")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Agg = {
    song_id: string;
    title: string;
    art_url: string | null;
    play_count: number;
  };
  const byId = new Map<string, Agg>();

  for (const p of plays || []) {
    const song = Array.isArray(p.song) ? p.song[0] : p.song;
    if (!song) continue;
    const existing = byId.get(p.song_id);
    if (existing) {
      existing.play_count += 1;
    } else {
      byId.set(p.song_id, {
        song_id: p.song_id,
        title: song.title,
        art_url: song.art_url,
        play_count: 1,
      });
    }
  }

  const songs = [...byId.values()].sort((a, b) => b.play_count - a.play_count);
  const total_plays = (plays || []).length;

  return NextResponse.json({ songs, total_plays });
}
