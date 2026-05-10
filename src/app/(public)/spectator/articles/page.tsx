import { createAdminClient } from "@/lib/supabase/admin";
import { ArticleList } from "@/components/articles/ArticleList";
import { getEffectiveTripId } from "@/lib/simulator";

export default async function SpectatorArticlesPage() {
  const adminClient = createAdminClient();

  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  const { data: articles } = await adminClient
    .from("articles")
    .select(`
      id, title, content, publish_at, created_at,
      featured_image_url, featured_image_focal_x, featured_image_focal_y,
      author:users!articles_author_id_fkey(id, display_name, avatar_url),
      featured_image:gallery_items!articles_featured_image_id_fkey(id, media_url, thumbnail_url)
    `)
    .eq("trip_id", trip.id)
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = (articles || []).map((a: any) => ({
    ...a,
    author: Array.isArray(a.author) ? a.author[0] || null : a.author,
    featured_image: Array.isArray(a.featured_image) ? a.featured_image[0] || null : a.featured_image,
  }));

  return <ArticleList articles={normalized} />;
}
