import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/ProfileEditor";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

export default async function ProfilePage() {
  const user = await getAuthUser();

  if (!user) {
    redirect("/login");
  }

  const supabase = await createClient();
  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user.id);
  const queryClient = simulating ? createAdminClient() : supabase;

  const { data: profile } = await queryClient
    .from("users")
    .select(
      "id, display_name, full_name, email, phone, avatar_url, birthday, occupation, city, state, playing_since, swings, typical_shot, shirt_size, fun_fact, best_shot, player_handicaps(handicap_index)"
    )
    .eq("id", effectiveUserId)
    .single();

  if (!profile) {
    redirect("/login");
  }

  // Extract handicap_index from joined table
  const ph = Array.isArray(profile.player_handicaps) ? profile.player_handicaps[0] : profile.player_handicaps;
  const handicapIndex: number | null = ph?.handicap_index ?? null;

  // Fetch accolades and scramble stats in parallel
  const adminClient = createAdminClient();
  const [{ data: accolades }, { data: activeTrip }] = await Promise.all([
    queryClient
      .from("accolades")
      .select("id, title, trip:trip_settings(trip_year)")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false }),
    adminClient
      .from("trip_settings")
      .select("id")
      .eq("status", "active")
      .maybeSingle(),
  ]);

  let eightBagAverage: number | null = null;
  let avgScrambleScore: number | null = null;

  if (activeTrip) {
    const { data: stats } = await adminClient
      .from("user_scramble_stats")
      .select("eight_bag_average, avg_scramble_score")
      .eq("user_id", effectiveUserId)
      .eq("trip_id", activeTrip.id)
      .maybeSingle();
    eightBagAverage = stats?.eight_bag_average ?? null;
    avgScrambleScore = stats?.avg_scramble_score ?? null;
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <ProfileEditor
        profile={profile}
        accolades={accolades || []}
        handicapIndex={handicapIndex}
        eightBagAverage={eightBagAverage}
        avgScrambleScore={avgScrambleScore}
      />
    </div>
  );
}
