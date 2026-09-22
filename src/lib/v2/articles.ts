import type { SupabaseClient } from "@supabase/supabase-js";
import { sendV2Notifications } from "./notifications";
import { logActivity } from "./activity";
import { orgSlug } from "./orgs";
import { stripMarkdown } from "./text";

/**
 * Article go-live delivery, shared by the inline publish paths (POST/PUT) and the
 * v2-articles-publish cron so "publish now" and scheduled publishes behave
 * identically.
 *
 * The activity-feed entry is logged on EVERY first go-live (publishing is always
 * feed-worthy). The push notification is gated by the article's notify_on_publish
 * flag. A single notified_at tombstone guards both against double-firing.
 */

export interface PublishableArticle {
  id: string;
  org_id: string;
  author_id: string | null;
  title: string;
  content: string | null;
  image_url: string | null;
  notify_on_publish: boolean;
}

/** Deliver an article's go-live: feed entry (always) + push (if opted in). */
export async function publishArticle(
  admin: SupabaseClient,
  a: PublishableArticle,
  slug: string | null,
  notify: boolean,
): Promise<number> {
  const link = slug ? `/new/${slug}/articles/${a.id}` : null;
  const preview = stripMarkdown(a.content || "", 140) || null;

  await logActivity(admin, {
    orgId: a.org_id,
    kind: "article",
    actorId: a.author_id ?? null,
    title: a.title,
    subtitle: preview,
    imageUrl: a.image_url ?? null,
    link,
    refId: a.id,
  });

  if (!notify) return 0;

  const { data: members } = await admin
    .from("v2_memberships")
    .select("user_id")
    .eq("org_id", a.org_id)
    .eq("status", "active")
    .is("archived_at", null);
  const ids = [...new Set((members || []).map((m) => m.user_id as string).filter(Boolean))];
  if (ids.length) {
    await sendV2Notifications(admin, ids, {
      orgId: a.org_id,
      type: "article",
      title: a.title,
      body: preview || undefined,
      data: { articleId: a.id, ...(link ? { url: link } : {}) },
    });
  }
  return ids.length;
}

/**
 * If the article is live and hasn't been broadcast yet, claim the one-time
 * notified_at tombstone atomically and deliver its go-live. Safe to call from
 * multiple paths concurrently — only the caller that wins the claim broadcasts.
 */
export async function broadcastIfNewlyLive(admin: SupabaseClient, articleId: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: claimed } = await admin
    .from("v2_articles")
    .update({ notified_at: nowIso })
    .eq("id", articleId)
    .is("notified_at", null)
    .not("publish_at", "is", null)
    .lte("publish_at", nowIso)
    .select("id, org_id, author_id, title, content, image_url, notify_on_publish")
    .maybeSingle();
  if (!claimed) return; // not live yet, or already broadcast

  const slug = await orgSlug(admin, claimed.org_id);
  await publishArticle(admin, claimed as PublishableArticle, slug, claimed.notify_on_publish);
}
