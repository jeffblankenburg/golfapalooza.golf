import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAudienceUserIds } from "@/lib/audience";
import { sendBulkNotifications } from "@/lib/notifications/service";

/**
 * Fire the "new article" push to every active Loozer — exactly once per
 * article. The notification is CLAIMED atomically by stamping `notified_at`
 * under a `notified_at IS NULL` guard, so the inline publish path (POST/PUT)
 * and the `articles-publish` cron can never double-send, and later edits to an
 * already-live article never re-notify.
 *
 * No-op (returns false) when the article isn't currently eligible: draft
 * (`publish_at` null), future-dated (scheduled), opted out
 * (`notify_on_publish=false`), or already notified. Safe to call after any
 * create/update — it self-guards.
 *
 * Best-effort: on send failure the claim is released so a later cron tick
 * retries. Dispatch is simulator-aware via sendBulkNotifications.
 */
export async function maybeNotifyArticlePublished(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, "public", any>,
  articleId: string,
): Promise<boolean> {
  const now = new Date().toISOString();

  // Claim the one-time transition to "notified". Only one caller wins.
  const { data: claimed } = await admin
    .from("articles")
    .update({ notified_at: now })
    .eq("id", articleId)
    .eq("notify_on_publish", true)
    .is("notified_at", null)
    .not("publish_at", "is", null)
    .lte("publish_at", now)
    .select("id, title")
    .maybeSingle();

  if (!claimed) return false;

  try {
    const userIds = await resolveAudienceUserIds(admin, { audience_type: "everyone" });
    if (userIds.length > 0) {
      await sendBulkNotifications(userIds, {
        type: "article",
        title: claimed.title,
        body: "New article posted — tap to read.",
        data: { url: `/articles/${claimed.id}`, article_id: claimed.id },
      });
    }
    return true;
  } catch (err) {
    // Release the claim so the cron can retry on its next tick.
    await admin.from("articles").update({ notified_at: null }).eq("id", claimed.id);
    console.error("[Articles] publish notification failed:", err);
    return false;
  }
}
