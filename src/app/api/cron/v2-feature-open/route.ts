import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { sendV2Notifications } from "@/lib/v2/notifications";
import { FEATURE_BY_KEY, featureHref } from "@/lib/v2/features";

/**
 * Cron (#218, generalized): fire each feature's authored "it's now open" notification
 * once its scheduled window opens. Any windowed, visible feature with an authored
 * title sends to members when available_from passes. Bearer-authed (CRON_SECRET);
 * claims the one-time open_notification_sent_at tombstone atomically (no double-send).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();
  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("v2_event_features")
    .select("org_id, event_id, feature_key, open_notification_title, open_notification_body")
    .eq("availability", "window")
    .neq("visibility", "off")
    .is("open_notification_sent_at", null)
    .not("open_notification_title", "is", null)
    .not("available_from", "is", null)
    .not("event_id", "is", null)
    .lte("available_from", nowIso);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due?.length) return NextResponse.json({ processed: 0 });

  let processed = 0;
  for (const r of due) {
    // Claim atomically so overlapping runs don't double-send.
    const { data: claimed } = await admin
      .from("v2_event_features")
      .update({ open_notification_sent_at: nowIso })
      .eq("org_id", r.org_id as string).eq("event_id", r.event_id as string).eq("feature_key", r.feature_key as string)
      .is("open_notification_sent_at", null)
      .select("feature_key");
    if (!claimed?.length) continue;

    try {
      const orgId = r.org_id as string;
      const def = FEATURE_BY_KEY[r.feature_key as string];
      const { data: orgRow } = await admin.from("v2_organizations").select("slug").eq("id", orgId).maybeSingle();
      const slug = orgRow?.slug as string | undefined;
      const { data: members } = await admin
        .from("v2_memberships").select("user_id").eq("org_id", orgId).eq("status", "active").is("archived_at", null);
      const ids = (members || []).map((m) => m.user_id as string);
      if (ids.length) {
        const href = def && slug ? featureHref(slug, def) : null;
        await sendV2Notifications(admin, ids, {
          orgId,
          type: "feature_open",
          title: r.open_notification_title as string,
          body: (r.open_notification_body as string | null) || undefined,
          data: href ? { url: href } : {},
        });
      }
      processed++;
    } catch (err) {
      console.error(`Cron v2-feature-open: failed for ${r.feature_key}:`, err);
    }
  }

  return NextResponse.json({ processed });
}
