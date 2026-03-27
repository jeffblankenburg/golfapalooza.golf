import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HomeContent } from "@/components/HomeContent";
import { getEffectiveUserId, getEffectiveDate, getSimDate, isSimulating } from "@/lib/simulator";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Simulator support
  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user!.id);
  const simDate = await getSimDate();
  const queryClient = simulating ? createAdminClient() : supabase;

  const { data: profile } = await queryClient
    .from("users")
    .select("display_name")
    .eq("id", effectiveUserId)
    .single();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("*")
    .eq("status", "active")
    .single();

  // Fetch action item counts, RSVP status, and room assignment
  let incompleteActionCount = 0;
  let totalActionCount = 0;
  let rsvpLikelihood: number | null = null;
  let myRoomNumber: string | null = null;
  let myFacilityName: string | null = null;
  let myTeeTime: string | null = null;
  let myStartingHole: number | null = null;
  let myTeammates: string[] = [];
  let teeTimeDay: string | null = null;
  let participants: { likelihood: number; displayName: string }[] = [];
  let nextScheduleItem: { title: string; location: string | null; time: string | null; dayLabel: string } | null = null;

  if (trip) {
    const [itemsResult, completionsResult, rsvpResult, roomResult, participantsResult] = await Promise.all([
      queryClient
        .from("action_items")
        .select("id")
        .eq("trip_id", trip.id),
      queryClient
        .from("user_action_completions")
        .select("action_item_id")
        .eq("user_id", effectiveUserId),
      queryClient
        .from("event_participants")
        .select("likelihood")
        .eq("trip_id", trip.id)
        .eq("user_id", effectiveUserId)
        .maybeSingle(),
      queryClient
        .from("room_assignments")
        .select("room:rooms(room_number, facility:facilities(name))")
        .eq("user_id", effectiveUserId)
        .eq("trip_id", trip.id)
        .maybeSingle(),
      queryClient
        .from("event_participants")
        .select("likelihood, user:users(display_name)")
        .eq("trip_id", trip.id)
        .not("likelihood", "is", null),
    ]);

    const allItems = itemsResult.data || [];
    const completedIds = new Set(
      (completionsResult.data || []).map((c) => c.action_item_id)
    );
    totalActionCount = allItems.length;
    incompleteActionCount = allItems.filter((a) => !completedIds.has(a.id)).length;
    rsvpLikelihood = rsvpResult.data?.likelihood ?? null;

    participants = (participantsResult.data || []).map((p) => {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      return {
        likelihood: p.likelihood as number,
        displayName: (u as { display_name: string })?.display_name || "Unknown",
      };
    });

    if (roomResult.data?.room) {
      const room = Array.isArray(roomResult.data.room) ? roomResult.data.room[0] : roomResult.data.room;
      if (room) {
        myRoomNumber = room.room_number;
        const facility = Array.isArray(room.facility) ? room.facility[0] : room.facility;
        myFacilityName = facility?.name ?? null;
      }
    }

    // Fetch user's next tee time from two sources:
    // 1. tee_time_players (individual assignment, e.g. Ryder Cup)
    // 2. scramble_team_members → tee_times.scramble_team_id (scramble days)

    type TeeTimeMatch = {
      teeTimeId: string;
      teeTime: string;
      startingHole: number | null;
      dayNumber: number;
      source: "player" | "scramble";
      scrambleTeamId?: string;
    };

    const allMatches: TeeTimeMatch[] = [];

    // Source 1: Direct tee_time_players entries
    const { data: myTeeTimePlayers } = await queryClient
      .from("tee_time_players")
      .select("tee_time_id, tee_time:tee_times(id, trip_id, day_number, tee_time, starting_hole)")
      .eq("user_id", effectiveUserId);

    for (const ttp of myTeeTimePlayers || []) {
      const tt = Array.isArray(ttp.tee_time) ? ttp.tee_time[0] : ttp.tee_time;
      if (tt && tt.trip_id === trip.id && tt.tee_time) {
        allMatches.push({
          teeTimeId: tt.id,
          teeTime: tt.tee_time as string,
          startingHole: tt.starting_hole as number | null,
          dayNumber: tt.day_number as number,
          source: "player",
        });
      }
    }

    // Source 2: Scramble teams linked to tee times
    const { data: myScrambleMemberships } = await queryClient
      .from("scramble_team_members")
      .select("team_id")
      .eq("user_id", effectiveUserId);

    if (myScrambleMemberships && myScrambleMemberships.length > 0) {
      const teamIds = myScrambleMemberships.map((m) => m.team_id);
      const { data: teamTeeTimesData } = await queryClient
        .from("tee_times")
        .select("id, trip_id, day_number, tee_time, starting_hole, scramble_team_id")
        .eq("trip_id", trip.id)
        .in("scramble_team_id", teamIds);

      for (const tt of teamTeeTimesData || []) {
        if (tt.tee_time) {
          allMatches.push({
            teeTimeId: tt.id,
            teeTime: tt.tee_time as string,
            startingHole: tt.starting_hole as number | null,
            dayNumber: tt.day_number as number,
            source: "scramble",
            scrambleTeamId: tt.scramble_team_id as string,
          });
        }
      }
    }

    if (allMatches.length > 0) {
      const today = await getEffectiveDate();
      const startDate = new Date(trip.start_date + "T00:00:00");
      const diffDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const todayDayNumber = diffDays + 1;

      let bestMatch = allMatches.find((t) => t.dayNumber === todayDayNumber);
      if (!bestMatch) {
        bestMatch = allMatches
          .filter((t) => t.dayNumber > todayDayNumber)
          .sort((a, b) => a.dayNumber - b.dayNumber)[0];
      }
      if (!bestMatch) {
        bestMatch = allMatches.sort((a, b) => a.dayNumber - b.dayNumber)[0];
      }

      if (bestMatch) {
        myTeeTime = bestMatch.teeTime;
        myStartingHole = bestMatch.startingHole;

        const dayNames: Record<number, string> = {
          1: "Day 1 (Wed)",
          2: "Day 2 (Thu)",
          3: "Day 3 (Fri)",
          4: "Day 4 (Sat)",
        };
        teeTimeDay = dayNames[bestMatch.dayNumber] || `Day ${bestMatch.dayNumber}`;

        // Fetch teammates based on source
        if (bestMatch.source === "scramble" && bestMatch.scrambleTeamId) {
          const { data: teamMembers } = await queryClient
            .from("scramble_team_members")
            .select("user_id, user:users(display_name)")
            .eq("team_id", bestMatch.scrambleTeamId);

          myTeammates = (teamMembers || [])
            .filter((m) => m.user_id !== effectiveUserId)
            .map((m) => {
              const u = Array.isArray(m.user) ? m.user[0] : m.user;
              return u?.display_name || "Unknown";
            });
        } else {
          const { data: groupMembers } = await queryClient
            .from("tee_time_players")
            .select("user_id, user:users(display_name)")
            .eq("tee_time_id", bestMatch.teeTimeId);

          myTeammates = (groupMembers || [])
            .filter((m) => m.user_id !== effectiveUserId)
            .map((m) => {
              const u = Array.isArray(m.user) ? m.user[0] : m.user;
              return u?.display_name || "Unknown";
            });
        }
      }
    }

    // Fetch next schedule item
    const { data: scheduleItems } = await supabase
      .from("itinerary_items")
      .select("title, location, day_number, start_date, end_date, start_time, end_time")
      .eq("trip_id", trip.id)
      .order("day_number", { ascending: true, nullsFirst: true })
      .order("start_date", { ascending: true, nullsFirst: true })
      .order("start_time", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true });

    if (scheduleItems && scheduleItems.length > 0) {
      const today = await getEffectiveDate();
      const tripStart = new Date(trip.start_date + "T00:00:00");
      const diffDays = Math.floor((today.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
      const todayDayNumber = diffDays + 1;
      const todayStr = today.toISOString().split("T")[0];

      const dayNames: Record<number, string> = {
        1: "Day 1 (Wed)", 2: "Day 2 (Thu)", 3: "Day 3 (Fri)", 4: "Day 4 (Sat)",
      };

      const nowHours = today.getHours().toString().padStart(2, "0");
      const nowMinutes = today.getMinutes().toString().padStart(2, "0");
      const nowTime = `${nowHours}:${nowMinutes}`;

      const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      // Split into pre-event (day_number null) and trip-day items
      const preEvent = scheduleItems.filter((i) => i.day_number === null);
      const tripDays = scheduleItems.filter((i) => i.day_number !== null);

      type FoundItem = (typeof scheduleItems)[number];
      let found: FoundItem | undefined;

      // Before trip: check pre-event items whose date range hasn't fully passed
      if (todayDayNumber < 1) {
        found = preEvent.find((item) => {
          if (!item.start_date) return false;
          const relevantEnd = item.end_date || item.start_date;
          return relevantEnd >= todayStr;
        });
        if (!found) {
          found = tripDays[0];
        }
      } else {
        // During/after trip: find next trip-day item by time
        found = tripDays.find(
          (item) => item.day_number === todayDayNumber && (!item.start_time || item.start_time > nowTime)
        );
        // If nothing left today, also check items with end_time still in the future
        if (!found) {
          found = tripDays.find(
            (item) => item.day_number === todayDayNumber && item.end_time && item.end_time > nowTime
          );
        }
        if (!found) {
          found = tripDays.find((item) => (item.day_number ?? 0) > todayDayNumber);
        }
      }

      if (found) {
        let dayLabel: string;
        if (found.day_number) {
          dayLabel = dayNames[found.day_number] || `Day ${found.day_number}`;
        } else if (found.start_date) {
          const [, m, d] = found.start_date.split("-").map(Number);
          dayLabel = `${MONTH_SHORT[m - 1]} ${d}`;
          if (found.end_date && found.end_date !== found.start_date) {
            const [, em, ed] = found.end_date.split("-").map(Number);
            dayLabel += ` – ${MONTH_SHORT[em - 1]} ${ed}`;
          }
        } else {
          dayLabel = "Pre-Event";
        }

        nextScheduleItem = {
          title: found.title,
          location: found.location,
          time: found.start_time,
          dayLabel,
        };
      }
    }
  }

  return (
    <HomeContent
      displayName={profile?.display_name || "Loozer"}
      trip={trip}
      incompleteActionCount={incompleteActionCount}
      totalActionCount={totalActionCount}
      rsvpLikelihood={rsvpLikelihood}
      myRoomNumber={trip?.show_rooms ? myRoomNumber : null}
      myFacilityName={trip?.show_rooms ? myFacilityName : null}
      myTeeTime={trip?.show_tee_times ? myTeeTime : null}
      myStartingHole={trip?.show_tee_times ? myStartingHole : null}
      myTeammates={trip?.show_tee_times ? myTeammates : []}
      teeTimeDay={trip?.show_tee_times ? teeTimeDay : null}
      simulatedDate={simDate}
      participants={participants}
      nextScheduleItem={nextScheduleItem}
    />
  );
}
