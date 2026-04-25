import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/loozers/{userId}:
 *   get:
 *     summary: Get a Loozer's profile with accolades and tagged photos
 *     tags: [Loozers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loozer profile
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simulating = await isSimulating();
  const queryClient = simulating ? createAdminClient() : supabase;
  const adminClient = createAdminClient();

  // Fetch everything in parallel — profile, accolades, photos, handicap, bio, song
  const [
    { data: profile, error: profileError },
    { data: accolades },
    { data: taggedRows, count: taggedPhotosCount },
    { data: handicapRow },
    { data: bioData },
    { data: song },
    { data: teamMemberships },
  ] = await Promise.all([
    queryClient
      .from("users")
      .select(
        "id, display_name, full_name, avatar_url, phone, city, state, playing_since, swings, typical_shot, fun_fact, best_shot, occupation, eight_bag_average, avg_scramble_score, is_founder, sponsor_id"
      )
      .eq("id", userId)
      .single(),
    queryClient
      .from("accolades")
      .select("id, title, trip:trip_settings(trip_year)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    queryClient
      .from("gallery_tags")
      .select(
        "item:gallery_items(id, media_url, thumbnail_url, media_type, created_at)",
        { count: "exact" }
      )
      .eq("tagged_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
    adminClient
      .from("player_handicaps")
      .select("handicap_index")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("loozer_bios")
      .select("content")
      .eq("user_id", userId)
      .eq("is_visible", true)
      .maybeSingle(),
    adminClient
      .from("songs")
      .select("id, title, mp3_url, art_url")
      .eq("tagged_user_id", userId)
      .limit(1)
      .maybeSingle(),
    adminClient
      .from("rounds")
      .select(`
        id, round_date, round_type, status,
        course:courses(name),
        round_players!inner(
          user_id, final_gross_score, score_differential,
          player_tee:course_tees(par)
        )
      `)
      .eq("round_players.user_id", userId)
      .not("round_players.final_gross_score", "is", null)
      .order("round_date", { ascending: false })
      .limit(10),
  ]);

  if (profileError || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let sponsor: { id: string; display_name: string; avatar_url: string | null } | null = null;
  if (profile.sponsor_id) {
    const { data: sponsorRow } = await adminClient
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("id", profile.sponsor_id)
      .maybeSingle();
    if (sponsorRow) sponsor = sponsorRow;
  }

  const bioNote = bioData && bioData.content ? { content: bioData.content } : null;

  const taggedPhotos = (taggedRows || [])
    .map((row) => {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      return item;
    })
    .filter(Boolean);

  // Build scorecards from individual rounds
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scorecards = (teamMemberships || []).map((r: any) => {
    const players = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = players.find((p: { user_id: string }) => p.user_id === userId) || players[0];
    if (!player?.final_gross_score) return null;
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const playerTee = player.player_tee ? (Array.isArray(player.player_tee) ? player.player_tee[0] : player.player_tee) : null;
    const par = playerTee?.par || 72;
    return {
      roundId: r.id,
      roundDate: r.round_date,
      roundType: r.round_type,
      courseName: course?.name || "Unknown",
      score: player.final_gross_score,
      par,
      scoreToPar: player.final_gross_score - par,
      differential: player.score_differential ?? null,
    };
  }).filter((x): x is NonNullable<typeof x> => x != null);

  return NextResponse.json({
    profile,
    accolades: accolades || [],
    taggedPhotos,
    taggedPhotosCount: taggedPhotosCount ?? 0,
    handicapIndex: handicapRow?.handicap_index ?? null,
    eightBagAverage: profile.eight_bag_average ?? null,
    avgScrambleScore: profile.avg_scramble_score ?? null,
    bio: bioNote,
    song,
    scorecards,
    isFounder: profile.is_founder === true,
    sponsor,
  });
}
