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

  // Fetch user's accolades across all events
  const { data: accolades } = await queryClient
    .from("accolades")
    .select("id, title, trip:trip_settings(trip_year)")
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: false });

  return (
    <div className="px-4 pt-6 pb-8">
      <ProfileEditor profile={profile} accolades={accolades || []} handicapIndex={handicapIndex} />
    </div>
  );
}
