import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBulkNotifications } from "@/lib/notifications/service";

export async function GET(request: NextRequest) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Fetch pending announcements that are due
  const { data: pending, error } = await supabase
    .from("scheduled_announcements")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for", { ascending: true });

  if (error) {
    console.error("Cron: failed to fetch scheduled announcements:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pending?.length) {
    return NextResponse.json({ processed: 0 });
  }

  let processed = 0;

  for (const announcement of pending) {
    try {
      // Resolve audience
      let userIds: string[] = [];

      if (announcement.audience_type === "everyone") {
        const { data: users } = await supabase
          .from("users")
          .select("id")
          .eq("is_active", true);
        userIds = (users || []).map((u) => u.id);
      } else if (announcement.audience_type === "event") {
        const tripId = announcement.trip_id;
        if (tripId) {
          const { data: participants } = await supabase
            .from("event_participants")
            .select("user_id")
            .eq("trip_id", tripId);
          userIds = (participants || []).map((p) => p.user_id);
        }
      } else if (announcement.audience_type === "custom") {
        userIds = (announcement.audience_user_ids as string[]) || [];
      }

      if (userIds.length > 0) {
        await sendBulkNotifications(userIds, {
          type: "announcement",
          title: announcement.title,
          body: announcement.body || undefined,
          data: { announcement_id: announcement.id },
        });
      }

      // Mark as sent
      await supabase
        .from("scheduled_announcements")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", announcement.id);

      processed++;
    } catch (err) {
      console.error(`Cron: failed to send announcement ${announcement.id}:`, err);
    }
  }

  return NextResponse.json({ processed });
}
