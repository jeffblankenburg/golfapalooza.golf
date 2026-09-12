import { NextRequest, NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { deliverAnnouncement } from "@/lib/v2/announcements";

/**
 * Cron: promote due v2 announcements. Bearer-authed (CRON_SECRET). For every
 * pending announcement whose scheduled_for has passed, resolve its audience,
 * deliver notifications + push, and mark it sent with a recipient snapshot.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = v2AdminClient();
  const { data: due, error } = await admin
    .from("v2_announcements")
    .select("id, org_id, title, body, audience_type, audience_user_ids, event_id, created_by")
    .eq("status", "pending")
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due?.length) return NextResponse.json({ processed: 0 });

  // Cache org→slug so N announcements for the same org don't re-query.
  const slugCache = new Map<string, string | null>();
  let processed = 0;

  for (const a of due) {
    try {
      if (!slugCache.has(a.org_id)) {
        const { data: org } = await admin
          .from("v2_organizations")
          .select("slug")
          .eq("id", a.org_id)
          .maybeSingle();
        slugCache.set(a.org_id, org?.slug ?? null);
      }
      const count = await deliverAnnouncement(admin, a, slugCache.get(a.org_id) ?? null);
      await admin
        .from("v2_announcements")
        .update({ status: "sent", sent_at: new Date().toISOString(), recipient_count: count })
        .eq("id", a.id);
      processed++;
    } catch (err) {
      console.error(`Cron v2-announcements: failed to send ${a.id}:`, err);
    }
  }

  return NextResponse.json({ processed });
}
