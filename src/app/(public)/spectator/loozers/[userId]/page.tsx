import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LoozerProfile } from "@/components/LoozerProfile";

export default async function SpectatorLoozerProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const adminClient = createAdminClient();

  // Fetch everything in parallel
  const [
    { data: profile },
    { data: accolades },
    { data: taggedRows, count: taggedPhotosCount },
    { data: handicapRow },
    { data: bioData },
    { data: roundsData },
  ] = await Promise.all([
    adminClient
      .from("users")
      .select(
        "id, display_name, avatar_url, city, state, playing_since, swings, typical_shot, fun_fact, best_shot, occupation, eight_bag_average, avg_scramble_score"
      )
      .eq("id", userId)
      .single(),
    adminClient
      .from("accolades")
      .select("id, title, trip:trip_settings(trip_year)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    adminClient
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

  if (!profile) notFound();

  const taggedPhotos = (taggedRows || [])
    .map((row) => {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      return item as { id: string; media_url: string; thumbnail_url: string | null; media_type: string; created_at: string } | null;
    })
    .filter(Boolean) as { id: string; media_url: string; thumbnail_url: string | null; media_type: string; created_at: string }[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scorecards = (roundsData || []).map((r: any) => {
    const players = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = players.find((p: { user_id: string }) => p.user_id === userId) || players[0];
    if (!player?.final_gross_score) return null;
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const playerTee = player.player_tee ? (Array.isArray(player.player_tee) ? player.player_tee[0] : player.player_tee) : null;
    const par = playerTee?.par || 72;
    return {
      roundDate: r.round_date as string,
      roundType: r.round_type as string,
      courseName: (course?.name || "Unknown") as string,
      score: player.final_gross_score as number,
      par: par as number,
      scoreToPar: (player.final_gross_score - par) as number,
      differential: (player.score_differential ?? null) as number | null,
    };
  }).filter((x): x is NonNullable<typeof x> => x != null);

  const bioContent = bioData?.content?.trim() ? { content: bioData.content } : null;

  return (
    <div className="px-4 pt-6 pb-8">
      <Link href="/spectator/loozers" className="text-sm text-green-700 font-medium mb-3 inline-block">
        &larr; All Loozers
      </Link>
      <LoozerProfile
        userId={userId}
        spectator
        data={{
          profile,
          accolades: (accolades || []) as { id: string; title: string; trip: { trip_year: number }[] | { trip_year: number } | null }[],
          taggedPhotos,
          taggedPhotosCount: taggedPhotosCount ?? 0,
          handicapIndex: handicapRow?.handicap_index ?? null,
          eightBagAverage: profile.eight_bag_average ?? null,
          avgScrambleScore: profile.avg_scramble_score ?? null,
          bio: bioContent,
          scorecards,
        }}
      />
    </div>
  );
}
