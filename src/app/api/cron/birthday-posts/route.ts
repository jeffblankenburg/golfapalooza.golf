import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBirthdaysToday, currentYearInTimezone } from "@/lib/birthday/today";
import { pickBirthdayMessage } from "@/lib/birthday/messages";
import { getEffectiveTripId } from "@/lib/simulator";

/**
 * Cron endpoint: runs once per day.
 * For every Loozer whose birthday falls on today (in the active trip's
 * timezone), posts a randomly-chosen birthday message to the "All Loozers"
 * chat room. The `birthday_posts` table enforces one post per user/year/room
 * so re-runs are safe.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("timezone")
    .eq("id", (await getEffectiveTripId())!)
    .single();
  const tz = trip?.timezone || "America/New_York";

  const birthdays = await getBirthdaysToday(adminClient, tz);
  if (birthdays.length === 0) {
    return NextResponse.json({ posted: 0, reason: "no birthdays today" });
  }

  const { data: room } = await adminClient
    .from("chat_rooms")
    .select("id")
    .eq("type", "group")
    .eq("name", "All Loozers")
    .single();
  if (!room) {
    return NextResponse.json({ error: "All Loozers room not found" }, { status: 500 });
  }

  // Birthday messages are posted as the system bot ("Al Pine") so they don't
  // appear to come from a real Loozer. See scripts/create-al-pine.mjs.
  const { data: sender } = await adminClient
    .from("users")
    .select("id")
    .eq("is_system", true)
    .limit(1)
    .maybeSingle();
  if (!sender) {
    return NextResponse.json(
      { error: "No system user (Al Pine) found — run scripts/create-al-pine.mjs" },
      { status: 500 }
    );
  }

  const year = currentYearInTimezone(tz);
  const results: { user_id: string; posted: boolean; reason?: string }[] = [];

  for (const birthday of birthdays) {
    const { data: existing } = await adminClient
      .from("birthday_posts")
      .select("user_id")
      .eq("user_id", birthday.id)
      .eq("year", year)
      .eq("room_id", room.id)
      .maybeSingle();

    if (existing) {
      results.push({ user_id: birthday.id, posted: false, reason: "already posted" });
      continue;
    }

    const content = pickBirthdayMessage(birthday.display_name, birthday.age);

    const { error: msgError } = await adminClient
      .from("chat_messages")
      .insert({ room_id: room.id, sender_id: sender.id, content });

    if (msgError) {
      results.push({ user_id: birthday.id, posted: false, reason: msgError.message });
      continue;
    }

    const { error: trackError } = await adminClient
      .from("birthday_posts")
      .insert({ user_id: birthday.id, year, room_id: room.id });

    if (trackError) {
      results.push({ user_id: birthday.id, posted: true, reason: `posted but tracking failed: ${trackError.message}` });
      continue;
    }

    results.push({ user_id: birthday.id, posted: true });
  }

  return NextResponse.json({
    posted: results.filter((r) => r.posted).length,
    results,
  });
}
