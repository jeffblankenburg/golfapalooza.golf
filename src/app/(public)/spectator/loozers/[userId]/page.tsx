import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SpectatorLoozerProfile } from "@/components/SpectatorLoozerProfile";

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
  ] = await Promise.all([
    adminClient
      .from("users")
      .select(
        "id, display_name, full_name, avatar_url, city, state, playing_since, swings, typical_shot, fun_fact, best_shot, occupation, eight_bag_average, avg_scramble_score"
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
  ]);

  if (!profile) notFound();

  const taggedPhotos = (taggedRows || [])
    .map((row) => {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      return item as { id: string; media_url: string; thumbnail_url: string | null; media_type: string; created_at: string } | null;
    })
    .filter(Boolean);

  return (
    <div className="px-4 pt-6 pb-8">
      <Link href="/spectator/loozers" className="text-sm text-green-700 font-medium mb-3 inline-block">
        &larr; All Loozers
      </Link>
      <SpectatorLoozerProfile
        profile={profile}
        accolades={(accolades || []) as { id: string; title: string; trip: { trip_year: number }[] | { trip_year: number } | null }[]}
        taggedPhotos={taggedPhotos as { id: string; media_url: string; thumbnail_url: string | null; media_type: string; created_at: string }[]}
        taggedPhotosCount={taggedPhotosCount ?? 0}
        handicapIndex={handicapRow?.handicap_index ?? null}
        eightBagAverage={profile.eight_bag_average ?? null}
        avgScrambleScore={profile.avg_scramble_score ?? null}
        bio={bioData?.content ? { content: bioData.content } : null}

      />
    </div>
  );
}
