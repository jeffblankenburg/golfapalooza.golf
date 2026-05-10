import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notifications/service";
import { getEffectiveTripId } from "@/lib/simulator";

/**
 * Cron endpoint: runs every 5 minutes.
 * Finds tee times within the reminder window and sends push notifications
 * to players who haven't been notified yet.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Get active trip with reminder settings
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date, timezone, tee_time_reminder_minutes")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip || !trip.start_date) {
    return NextResponse.json({ processed: 0, reason: "no active trip" });
  }

  const reminderMinutes = trip.tee_time_reminder_minutes ?? 30;
  if (reminderMinutes <= 0) {
    return NextResponse.json({ processed: 0, reason: "reminders disabled" });
  }

  // Calculate today's day_number relative to trip start
  const tz = trip.timezone || "America/New_York";
  const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
  const [y, m, d] = trip.start_date.split("-").map(Number);
  const tripStart = new Date(y, m - 1, d);
  const diffDays = Math.floor((nowInTz.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
  const todayDayNumber = diffDays + 1;

  if (todayDayNumber < 1) {
    return NextResponse.json({ processed: 0, reason: "trip hasn't started" });
  }

  // Get today's tee times
  const { data: teeTimes } = await supabase
    .from("tee_times")
    .select("id, tee_time, starting_hole, day_number, scramble_team_id")
    .eq("trip_id", trip.id)
    .eq("day_number", todayDayNumber)
    .not("tee_time", "is", null);

  if (!teeTimes || teeTimes.length === 0) {
    return NextResponse.json({ processed: 0, reason: "no tee times today" });
  }

  // Filter to tee times within the reminder window
  const nowHours = nowInTz.getHours();
  const nowMinutes = nowInTz.getMinutes();
  const nowTotalMinutes = nowHours * 60 + nowMinutes;

  const upcomingTeeTimes = teeTimes.filter((tt) => {
    const [h, min] = (tt.tee_time as string).split(":").map(Number);
    const ttTotalMinutes = h * 60 + min;
    const minutesUntil = ttTotalMinutes - nowTotalMinutes;
    // Send if tee time is between 0 and reminderMinutes from now
    return minutesUntil > 0 && minutesUntil <= reminderMinutes;
  });

  if (upcomingTeeTimes.length === 0) {
    return NextResponse.json({ processed: 0, reason: "no tee times in window" });
  }

  // Fetch already-sent reminders for these tee times
  const teeTimeIds = upcomingTeeTimes.map((tt) => tt.id);
  const { data: alreadySent } = await supabase
    .from("tee_time_reminders_sent")
    .select("tee_time_id, user_id")
    .in("tee_time_id", teeTimeIds);

  const sentSet = new Set(
    (alreadySent || []).map((s) => `${s.tee_time_id}:${s.user_id}`)
  );

  // Resolve players for each tee time
  // 1. Direct tee_time_players assignments
  const { data: directPlayers } = await supabase
    .from("tee_time_players")
    .select("tee_time_id, user_id, user:users!inner(display_name)")
    .in("tee_time_id", teeTimeIds);

  // 2. Scramble team members (for tee times linked to scramble teams)
  const scrambleTeamIds = upcomingTeeTimes
    .map((tt) => tt.scramble_team_id)
    .filter(Boolean) as string[];

  let scrambleMembers: { team_id: string; user_id: string; display_name: string }[] = [];
  if (scrambleTeamIds.length > 0) {
    const { data: members } = await supabase
      .from("scramble_team_members")
      .select("team_id, user_id, user:users!inner(display_name)")
      .in("team_id", scrambleTeamIds);

    scrambleMembers = (members || []).map((m) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        team_id: m.team_id,
        user_id: m.user_id,
        display_name: (u as { display_name: string })?.display_name || "Unknown",
      };
    });
  }

  // Build a map of tee_time_id -> scramble_team_id
  const ttToTeam = new Map<string, string>();
  for (const tt of upcomingTeeTimes) {
    if (tt.scramble_team_id) {
      ttToTeam.set(tt.id, tt.scramble_team_id);
    }
  }

  // Get event day names for nice labels
  const { data: eventDays } = await supabase
    .from("event_days")
    .select("day_number, name")
    .eq("trip_id", trip.id)
    .eq("day_number", todayDayNumber)
    .maybeSingle();

  const dayLabel = eventDays?.name
    ? `Day ${todayDayNumber} — ${eventDays.name}`
    : `Day ${todayDayNumber}`;

  // Send notifications
  let processed = 0;
  const sentRecords: { tee_time_id: string; user_id: string }[] = [];

  for (const tt of upcomingTeeTimes) {
    // Collect all players for this tee time
    const players: { user_id: string; display_name: string }[] = [];

    // Direct players
    for (const dp of directPlayers || []) {
      if (dp.tee_time_id === tt.id) {
        const u = Array.isArray(dp.user) ? dp.user[0] : dp.user;
        players.push({
          user_id: dp.user_id,
          display_name: (u as { display_name: string })?.display_name || "Unknown",
        });
      }
    }

    // Scramble team members
    const teamId = ttToTeam.get(tt.id);
    if (teamId) {
      for (const sm of scrambleMembers) {
        if (sm.team_id === teamId) {
          players.push({ user_id: sm.user_id, display_name: sm.display_name });
        }
      }
    }

    if (players.length === 0) continue;

    // Format tee time for display
    const [h, min] = (tt.tee_time as string).split(":").map(Number);
    const displayDate = new Date(2000, 0, 1, h, min);
    const formattedTime = displayDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    const holeText = tt.starting_hole ? ` on Hole ${tt.starting_hole}` : "";

    // Calculate minutes until
    const ttTotalMinutes = h * 60 + min;
    const minutesUntil = ttTotalMinutes - nowTotalMinutes;

    for (const player of players) {
      const key = `${tt.id}:${player.user_id}`;
      if (sentSet.has(key)) continue;

      // Build teammate list (everyone except the recipient)
      const teammates = players
        .filter((p) => p.user_id !== player.user_id)
        .map((p) => p.display_name);

      const teammateText = teammates.length > 0
        ? ` with ${teammates.join(", ")}`
        : "";

      await sendNotification(player.user_id, {
        type: "tee_time_reminder",
        title: `Tee Time in ${minutesUntil} Minutes`,
        body: `You're up at ${formattedTime}${holeText}${teammateText} — ${dayLabel}`,
        data: {
          tee_time_id: tt.id,
          day_number: todayDayNumber,
        },
      });

      sentRecords.push({ tee_time_id: tt.id, user_id: player.user_id });
      processed++;
    }
  }

  // Record sent notifications to prevent duplicates
  if (sentRecords.length > 0) {
    await supabase
      .from("tee_time_reminders_sent")
      .upsert(sentRecords, { onConflict: "tee_time_id,user_id" });
  }

  return NextResponse.json({ processed, day: todayDayNumber });
}
