import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { pickName } from "@/lib/v2/profile";
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
  content: string;
  image_url: string | null;
  image_focal_x: number | null;
  image_focal_y: number | null;
  publish_at: string | null;
  author: AuthorRef | AuthorRef[] | null;
}

/**
 * Full article reading page. Reached by tapping the featured-article card on the
 * home page. RLS scopes reads to published org articles (admins can preview
 * drafts). Author name honors the org's name-display mode.
 */
export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string; articleId: string }>;
}) {
  const { slug, articleId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data } = await supabase
    .from("v2_articles")
    .select(
      "id, title, content, image_url, image_focal_x, image_focal_y, publish_at, author:v2_profiles(display_name, first_name, last_name, avatar_url)",
    )
    .eq("id", articleId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!data) notFound();

  const a = data as unknown as ArticleRow;
  const author = Array.isArray(a.author) ? a.author[0] ?? null : a.author;
  const authorName = author ? pickName(author, org.name_display) : null;
  const dateText = a.publish_at
    ? new Date(a.publish_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <Link href={`/new/${slug}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      <article className={styles.articleDetail}>
        {a.image_url && (
          <div className={styles.articleDetailImage}>
            <img
              src={a.image_url}
              alt=""
              style={{ objectPosition: `${a.image_focal_x ?? 50}% ${a.image_focal_y ?? 50}%` }}
            />
          </div>
        )}

        <h1 className={styles.articleDetailTitle}>{a.title}</h1>

        <div className={styles.articleMeta}>
          {dateText && <span className={styles.articleDate}>{dateText}</span>}
          {authorName && (
            <span className={styles.articleAuthorGroup}>
              {author?.avatar_url ? (
                <img className={styles.articleMetaAvatar} src={author.avatar_url} alt="" />
              ) : (
                <span className={styles.articleMetaAvatarFallback}>{authorName[0]?.toUpperCase() || "?"}</span>
              )}
              <span className={styles.articleMetaAuthor}>{authorName}</span>
            </span>
          )}
        </div>

        <div className={styles.articleBody}>
          <ReactMarkdown>{a.content}</ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
