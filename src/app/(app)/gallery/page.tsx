import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { GalleryPage } from "@/components/gallery/GalleryPage";
import { AdminLink } from "@/components/AdminLink";

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

  // Get current user info
  const { data: profile } = await queryClient
    .from("users")
    .select("display_name, avatar_url, is_admin")
    .eq("id", effectiveUserId)
    .single();

  // Get all users (for tag picker on upload)
  const { data: users } = await queryClient
    .from("users")
    .select("id, display_name, avatar_url")
    .order("display_name");

  // Get distinct tagged user IDs (for filter)
  const { data: taggedRows } = await queryClient
    .from("gallery_tags")
    .select("tagged_user_id");
  const taggedUserIds = [...new Set((taggedRows || []).map((r) => r.tagged_user_id))];
  const taggedUsers = (users || []).filter((u) => taggedUserIds.includes(u.id));

  // Get distinct years from gallery items sort_date
  const { data: yearRows } = await queryClient
    .from("gallery_items")
    .select("taken_at")
    .not("taken_at", "is", null);
  const availableYears = [
    ...new Set(
      (yearRows || [])
        .map((r) => new Date(r.taken_at).getFullYear())
    ),
  ].sort((a, b) => b - a);

  return (
    <div className="px-4 pt-4 pb-8">
      <GalleryPage
        activeTripId={trip?.id || null}
        userId={effectiveUserId}
        userName={profile?.display_name || "Unknown"}
        isAdmin={profile?.is_admin || false}
        allUsers={users || []}
        taggedUsers={taggedUsers}
        availableYears={availableYears}
        headerAction={<AdminLink permissionKey="manage_gallery" href="/admin/gallery" />}
      />
    </div>
  );
}
