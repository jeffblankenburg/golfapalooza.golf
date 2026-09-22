import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { broadcastIfNewlyLive } from "@/lib/v2/articles";

/**
 * Cron: broadcast v2 articles whose scheduled publish time has passed. Bearer-
 * authed (CRON_SECRET). For every live, not-yet-broadcast article, log its
 * activity-feed entry and (if opted in) push to the org. broadcastIfNewlyLive
 * claims the one-time notified_at tombstone atomically, so this never
 * double-sends alongside the inline publish path.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();
  const { data: due, error } = await admin
    .from("v2_articles")
    .select("id")
    .is("notified_at", null)
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString())
    .order("publish_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due?.length) return NextResponse.json({ processed: 0 });

  let processed = 0;
  for (const a of due) {
    try {
      await broadcastIfNewlyLive(admin, a.id);
      processed++;
    } catch (err) {
      console.error(`Cron v2-articles-publish: failed for ${a.id}:`, err);
    }
  }

  return NextResponse.json({ processed });
}
