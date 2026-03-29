import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { GalleryPage } from "@/components/gallery/GalleryPage";

export default async function GalleryServerPage() {
  const user = await getAuthUser();

  if (!user) redirect("/login");

  const supabase = await createClient();
  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const queryClient = simulating ? createAdminClient() : supabase;

  // Get active trip (for associating new uploads)
  const { data: trip } = await queryClient
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  // Get all trips (for filter dropdown)
  const { data: allTrips } = await queryClient
    .from("trip_settings")
    .select("id, trip_year")
    .order("trip_year", { ascending: false });

  // Get current user info
  const { data: profile } = await queryClient
    .from("users")
    .select("display_name, avatar_url, is_admin")
    .eq("id", effectiveUserId)
    .single();

  // Get all active users (for tag picker)
  const { data: users } = await queryClient
    .from("users")
    .select("id, display_name, avatar_url")
    .order("display_name");

  return (
    <div className="px-4 pt-4 pb-8">
      <GalleryPage
        activeTripId={trip?.id || null}
        allTrips={allTrips || []}
        userId={effectiveUserId}
        userName={profile?.display_name || "Unknown"}
        isAdmin={profile?.is_admin || false}
        allUsers={users || []}
      />
    </div>
  );
}
