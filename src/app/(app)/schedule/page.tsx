import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScheduleView } from "@/components/ScheduleView";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

export default async function SchedulePage() {
  const user = await getAuthUser();
  const supabase = await createClient();

  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user!.id);
  const queryClient = simulating ? createAdminClient() : supabase;

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date, show_tee_times, timezone")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <p className="text-gray-500 text-center py-8">
          Schedule hasn&apos;t been set up yet.
        </p>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("itinerary_items")
    .select("id, title, location, day_number, start_date, start_time, end_date, end_time")
    .eq("trip_id", trip.id)
    .order("day_number", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  // Fetch user's tee times for this trip
  const myTeeTimesByDay: Record<number, { tee_time: string; starting_hole: number | null; teammates: string[] }> = {};

  if (user) {
    type TeeTimeInfo = {
      teeTimeId: string;
      dayNumber: number;
      teeTime: string;
      startingHole: number | null;
      source: "player" | "scramble";
      scrambleTeamId?: string;
    };

    const teeTimeEntries: TeeTimeInfo[] = [];

    // Fetch both tee time sources in parallel
    const [directEntriesResult, myTeamsResult] = await Promise.all([
      queryClient
        .from("tee_time_players")
        .select("tee_time:tee_times(id, trip_id, day_number, tee_time, starting_hole)")
        .eq("user_id", effectiveUserId),
      queryClient
        .from("scramble_team_members")
        .select("team_id")
        .eq("user_id", effectiveUserId),
    ]);

    // Source 1: Direct tee_time_players
    for (const entry of directEntriesResult.data || []) {
      const tt = Array.isArray(entry.tee_time) ? entry.tee_time[0] : entry.tee_time;
      if (tt && tt.trip_id === trip.id && tt.tee_time) {
        teeTimeEntries.push({
          teeTimeId: tt.id,
          dayNumber: tt.day_number as number,
          teeTime: tt.tee_time as string,
          startingHole: tt.starting_hole as number | null,
          source: "player",
        });
      }
    }

    // Source 2: Scramble teams linked to tee times
    const myTeams = myTeamsResult.data;
    if (myTeams && myTeams.length > 0) {
      const teamIds = myTeams.map((m) => m.team_id);
      const { data: teamTeeTimesData } = await queryClient
        .from("tee_times")
        .select("id, day_number, tee_time, starting_hole, scramble_team_id")
        .eq("trip_id", trip.id)
        .in("scramble_team_id", teamIds);

      for (const tt of teamTeeTimesData || []) {
        if (tt.tee_time) {
          teeTimeEntries.push({
            teeTimeId: tt.id,
            dayNumber: tt.day_number as number,
            teeTime: tt.tee_time as string,
            startingHole: tt.starting_hole as number | null,
            source: "scramble",
            scrambleTeamId: tt.scramble_team_id as string,
          });
        }
      }
    }

    // Fetch teammates for all tee times in parallel
    const teammateResults = await Promise.all(
      teeTimeEntries.map((entry) => {
        if (entry.source === "scramble" && entry.scrambleTeamId) {
          return queryClient
            .from("scramble_team_members")
            .select("user_id, user:users(display_name)")
            .eq("team_id", entry.scrambleTeamId);
        } else {
          return queryClient
            .from("tee_time_players")
            .select("user_id, user:users(display_name)")
            .eq("tee_time_id", entry.teeTimeId);
        }
      })
    );

    teeTimeEntries.forEach((entry, i) => {
      const members = teammateResults[i].data || [];
      const teammates = members
        .filter((m) => m.user_id !== effectiveUserId)
        .map((m) => {
          const u = Array.isArray(m.user) ? m.user[0] : m.user;
          return u?.display_name || "Unknown";
        });

      myTeeTimesByDay[entry.dayNumber] = {
        tee_time: entry.teeTime,
        starting_hole: entry.startingHole,
        teammates,
      };
    });
  }

  return <ScheduleView items={items || []} startDate={trip.start_date} teeTimesByDay={trip.show_tee_times ? myTeeTimesByDay : {}} timezone={trip.timezone} />;
}
