import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { ArticleList } from "@/components/articles/ArticleList";
import { AdminLink } from "@/components/AdminLink";

export default async function ArticlesPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();
  const simulating = await isSimulating();
  const queryClient = simulating ? createAdminClient() : supabase;

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  // RLS ensures only published articles are returned for non-admin users
  const { data: articles } = await queryClient
    .from("articles")
    .select(`
      id, title, content, publish_at, created_at,
      featured_image_url, featured_image_source, featured_image_focal_x, featured_image_focal_y,
      author:users!articles_author_id_fkey(id, display_name, avatar_url),
      featured_image:gallery_items!articles_featured_image_id_fkey(id, media_url, thumbnail_url)
    `)
    .eq("trip_id", trip.id)
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: false });

  // Normalize Supabase array joins to single objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (articles || []).map((a: any) => ({
    ...a,
    author: Array.isArray(a.author) ? a.author[0] || null : a.author,
    featured_image: Array.isArray(a.featured_image) ? a.featured_image[0] || null : a.featured_image,
  }));

  return (
    <ArticleList articles={normalized} headerAction={<AdminLink permissionKey="manage_articles" href="/admin/articles" />} />
  );
}
