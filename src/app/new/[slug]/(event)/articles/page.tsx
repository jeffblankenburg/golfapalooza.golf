import { redirect } from "next/navigation";
import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { pickName } from "@/lib/v2/profile";
import { stripMarkdown } from "@/lib/v2/text";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface AuthorRef {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}
interface ArticleRow {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  publish_at: string;
  author: AuthorRef | AuthorRef[] | null;
}

/**
 * The Articles index — every published article for the org, newest first. Reached
 * from the "Everything" launcher (feature: articles) or a pinned bottom-bar slot.
 * Author names honor the org's name-display mode.
 */
export default async function ArticlesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();

  // Respect the Articles feature toggle (redirect if it's off for this viewer).
  const isAdmin = org.role === "owner" || org.role === "admin";
  const resolved = await loadResolvedFeatures(supabase, org.id, null);
  if (!isFeatureVisible(resolved, "articles", isAdmin)) redirect(`/new/${slug}`);

  const nowIso = new Date().toISOString();
  const { data } = await supabase
    .from("v2_articles")
    .select(
      "id, title, content, image_url, image_focal_x, image_focal_y, publish_at, author:v2_profiles(display_name, first_name, last_name, avatar_url)",
    )
    .eq("org_id", org.id)
    .not("publish_at", "is", null)
    .lte("publish_at", nowIso)
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("publish_at", { ascending: false });

  const articles = ((data as unknown as ArticleRow[] | null) ?? []).map((a) => {
    const author = Array.isArray(a.author) ? a.author[0] ?? null : a.author;
    return {
      id: a.id,
      title: a.title,
      imageUrl: a.image_url,
      focalX: a.image_focal_x ?? 50,
      focalY: a.image_focal_y ?? 50,
      preview: stripMarkdown(a.content || "") || null,
      dateText: new Date(a.publish_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
      authorName: author ? pickName(author, org.name_display) : null,
      authorAvatar: author?.avatar_url ?? null,
    };
  });

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <Link href={`/new/${slug}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      <p className={styles.eyebrow}>Stories & Recognition</p>
      <h1 className={styles.title}>Articles</h1>

      {articles.length === 0 ? (
        <p className={styles.lede}>No articles published yet. Check back soon.</p>
      ) : (
        <div className={styles.articleList}>
          {articles.map((a) => (
            <Link key={a.id} href={`/new/${slug}/articles/${a.id}`} className={styles.articleCard}>
              <div className={styles.articleImage}>
                {a.imageUrl && (
                  <img src={a.imageUrl} alt="" style={{ objectPosition: `${a.focalX}% ${a.focalY}%` }} />
                )}
                <div className={styles.articleImageScrim} />
                <div className={styles.articleImageText}>
                  <p className={styles.articleOverlayTitle}>{a.title}</p>
                  <div className={styles.articleMeta}>
                    <span className={styles.articleDate}>{a.dateText}</span>
                    {a.authorName && (
                      <span className={styles.articleAuthorGroup}>
                        {a.authorAvatar ? (
                          <img className={styles.articleMetaAvatar} src={a.authorAvatar} alt="" />
                        ) : (
                          <span className={styles.articleMetaAvatarFallback}>
                            {a.authorName[0]?.toUpperCase() || "?"}
                          </span>
                        )}
                        <span className={styles.articleMetaAuthor}>{a.authorName}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              {a.preview && (
                <div className={styles.articleExcerptWrap}>
                  <p className={styles.articleExcerpt}>{a.preview}</p>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
