import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ArticleDetail } from "@/components/articles/ArticleDetail";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // RLS ensures only published articles are visible
  const { data: article } = await supabase
    .from("articles")
    .select(`
      id, title, content, publish_at, created_at,
      featured_image_url, featured_image_focal_x, featured_image_focal_y,
      author:users!articles_author_id_fkey(id, display_name, avatar_url),
      featured_image:gallery_items!articles_featured_image_id_fkey(id, media_url, thumbnail_url)
    `)
    .eq("id", articleId)
    .single();

  if (!article) {
    redirect("/articles");
  }

  // Normalize Supabase array joins to single objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalized = {
    ...article,
    author: Array.isArray(article.author) ? article.author[0] || null : article.author,
    featured_image: Array.isArray(article.featured_image) ? article.featured_image[0] || null : article.featured_image,
  };

  return <ArticleDetail article={normalized} />;
}
