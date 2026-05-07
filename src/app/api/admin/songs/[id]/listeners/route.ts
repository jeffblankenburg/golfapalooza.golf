import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/songs/{id}/listeners:
 *   get:
 *     summary: Get the Loozers who have played and/or liked a song
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Listener breakdown for the song
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 plays:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id: { type: string, format: uuid }
 *                       display_name: { type: string }
 *                       avatar_url: { type: string, nullable: true }
 *                       count: { type: integer }
 *                       last_played_at: { type: string, format: date-time }
 *                 likes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id: { type: string, format: uuid }
 *                       display_name: { type: string }
 *                       avatar_url: { type: string, nullable: true }
 *                       created_at: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkPermissionAccess("manage_music");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const adminClient = createAdminClient();

  const [playsResult, likesResult] = await Promise.all([
    adminClient
      .from("song_plays")
      .select("user_id, played_at, user:users(id, display_name, avatar_url)")
      .eq("song_id", id)
      .order("played_at", { ascending: false }),
    adminClient
      .from("song_favorites")
      .select("user_id, created_at, user:users(id, display_name, avatar_url)")
      .eq("song_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (playsResult.error) {
    return NextResponse.json({ error: playsResult.error.message }, { status: 500 });
  }
  if (likesResult.error) {
    return NextResponse.json({ error: likesResult.error.message }, { status: 500 });
  }

  // Group plays by user_id, keep count + most-recent played_at
  type PlayAgg = {
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    count: number;
    last_played_at: string;
  };
  type EmbeddedUser = { id: string; display_name: string; avatar_url: string | null };
  const pickUser = (raw: unknown): EmbeddedUser | null => {
    if (!raw) return null;
    const candidate = Array.isArray(raw) ? raw[0] : raw;
    return (candidate as EmbeddedUser) ?? null;
  };

  const playsByUser = new Map<string, PlayAgg>();
  for (const row of playsResult.data || []) {
    const u = pickUser((row as { user: unknown }).user);
    if (!u) continue;
    const existing = playsByUser.get(u.id);
    if (existing) {
      existing.count += 1;
    } else {
      playsByUser.set(u.id, {
        user_id: u.id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        count: 1,
        last_played_at: row.played_at,
      });
    }
  }
  const plays = Array.from(playsByUser.values()).sort((a, b) => b.count - a.count);

  const likes = (likesResult.data || [])
    .map((row) => {
      const u = pickUser((row as { user: unknown }).user);
      if (!u) return null;
      return {
        user_id: u.id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        created_at: row.created_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ plays, likes });
}
