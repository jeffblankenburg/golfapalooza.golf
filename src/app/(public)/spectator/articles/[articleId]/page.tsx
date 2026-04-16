import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ArticleDetail } from "@/components/articles/ArticleDetail";

export default async function SpectatorArticleDetailPage({
  params,
}: {
  params: Promise<{ articleId: string }>;
}) {
  const { articleId } = await params;
  const adminClient = createAdminClient();

  const { data: article } = await adminClient
    .from("articles")
    .select(`
      id, title, content, publish_at, created_at,
      featured_image_url, featured_image_focal_x, featured_image_focal_y,
      author:users!articles_author_id_fkey(id, display_name, avatar_url),
      featured_image:gallery_items!articles_featured_image_id_fkey(id, media_url, thumbnail_url)
    `)
    .eq("id", articleId)
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString())
    .single();

  if (!article) {
    redirect("/spectator/articles");
  }

  const normalized = {
    ...article,
    author: Array.isArray(article.author) ? article.author[0] || null : article.author,
    featured_image: Array.isArray(article.featured_image) ? article.featured_image[0] || null : article.featured_image,
  };

  return <ArticleDetail article={normalized} />;
}
