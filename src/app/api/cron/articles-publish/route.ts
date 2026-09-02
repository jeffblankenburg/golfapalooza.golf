import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { maybeNotifyArticlePublished } from "@/lib/articles/notify";

/**
 * @swagger
 * /api/cron/articles-publish:
 *   get:
 *     summary: Fire "new article" pushes for articles whose scheduled time has arrived
 *     tags: [Cron]
 *     description: |
 *       Bearer-authed. Runs every minute. Finds articles that are due
 *       (`notify_on_publish=true`, `notified_at IS NULL`, `publish_at <= now`)
 *       and notifies every active Loozer once each. "Publish Now" articles are
 *       already handled inline by the articles API; this catches the scheduled
 *       ones. Claiming is atomic in `maybeNotifyArticlePublished`, so a race
 *       with the inline path can't double-send.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: due } = await admin
    .from("articles")
    .select("id")
    .eq("notify_on_publish", true)
    .is("notified_at", null)
    .not("publish_at", "is", null)
    .lte("publish_at", now)
    .order("publish_at", { ascending: true })
    .limit(50);

  let notified = 0;
  for (const a of due || []) {
    if (await maybeNotifyArticlePublished(admin, a.id)) notified += 1;
  }

  return NextResponse.json({ notified });
}
