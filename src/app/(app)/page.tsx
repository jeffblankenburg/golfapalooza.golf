import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HomeContent } from "@/components/HomeContent";
import { getEffectiveUserId, getEffectiveDate, getSimDate, isSimulating } from "@/lib/simulator";

export default async function HomePage() {
  const user = await getAuthUser();
  const supabase = await createClient();

  // Simulator support (cookie reads — instant)
  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user!.id);
  const simDate = await getSimDate();
  const queryClient = simulating ? createAdminClient() : supabase;

  // ── Phase 1: profile + trip in parallel ──
  const [profileResult, tripResult] = await Promise.all([
    queryClient
      .from("users")
      .select("display_name")
      .eq("id", effectiveUserId)
      .single(),
    supabase
      .from("trip_settings")
      .select("*")
      .eq("status", "active")
      .single(),
  ]);

  const profile = profileResult.data;
  const trip = tripResult.data;

  if (!trip) {
    return (
      <HomeContent
        displayName={profile?.display_name || "Loozer"}
        trip={null}
        incompleteActionCount={0}
        totalActionCount={0}
        rsvpLikelihood={null}
        simulatedDate={simDate}
      />
    );
  }

  // ── Phase 2: ALL trip-dependent queries in parallel ──
  const [
    courseResult,
    itemsResult,
    completionsResult,
    rsvpResult,
    participantsResult,
    teeTimePlayersResult,
    scrambleMembershipsResult,
    calcuttaResult,
    scheduleResult,
    contestTypesResult,
    eventDaysResult,
  ] = await Promise.all([
    // Course info
    trip.course_id
      ? supabase.from("courses").select("name, city, state").eq("id", trip.course_id).single()
      : Promise.resolve({ data: null } as { data: null }),
    // Action items
    queryClient.from("action_items").select("id").eq("trip_id", trip.id),
    // Completions
    queryClient.from("user_action_completions").select("action_item_id").eq("user_id", effectiveUserId),
    // RSVP
    queryClient.from("event_participants").select("likelihood").eq("trip_id", trip.id).eq("user_id", effectiveUserId).maybeSingle(),
    // All participants
    queryClient.from("event_participants").select("user_id, likelihood, user:users(display_name, avatar_url)").eq("trip_id", trip.id).not("likelihood", "is", null),
    // Tee time players
    queryClient.from("tee_time_players").select("tee_time_id, tee_time:tee_times(id, trip_id, day_number, tee_time, starting_hole)").eq("user_id", effectiveUserId),
    // Scramble memberships
    queryClient.from("scramble_team_members").select("team_id").eq("user_id", effectiveUserId),
    // Calcutta contest
    queryClient.from("contests").select("id, calcutta_active_order").eq("trip_id", trip.id).eq("contest_type", "calcutta").maybeSingle(),
    // Schedule items
    supabase.from("itinerary_items").select("title, location, day_number, start_date, end_date, start_time, end_time").eq("trip_id", trip.id).order("day_number", { ascending: true, nullsFirst: true }).order("start_date", { ascending: true, nullsFirst: true }).order("start_time", { ascending: true, nullsFirst: false }).order("sort_order", { ascending: true }),
    // Contest types for quick links
    supabase.from("contests").select("contest_type").eq("trip_id", trip.id),
    // Event days for day name lookups
    supabase.from("event_days").select("day_number, name").eq("trip_id", trip.id).order("day_number"),
  ]);

  // ── Process Phase 2 results ──

  // Course venue
  let courseVenue: string | null = null;
  if (courseResult.data) {
    const course = courseResult.data as { name: string; city: string; state: string };
    const parts = [course.name, course.city, course.state].filter(Boolean);
    courseVenue = parts.join(", ") || null;
  }

  // Action items
  const allItems = itemsResult.data || [];
  const completedIds = new Set((completionsResult.data || []).map((c) => c.action_item_id));
  const totalActionCount = allItems.length;
  const incompleteActionCount = allItems.filter((a) => !completedIds.has(a.id)).length;
  const rsvpLikelihood = rsvpResult.data?.likelihood ?? null;

  // Participants
  const participants = (participantsResult.data || []).map((p) => {
    const u = Array.isArray(p.user) ? p.user[0] : p.user;
    const typed = u as { display_name: string; avatar_url: string | null } | null;
    return {
      userId: p.user_id as string,
      likelihood: p.likelihood as number,
      displayName: typed?.display_name || "Unknown",
      avatarUrl: typed?.avatar_url || null,
    };
  });

  // Build tee time matches from both sources
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
  for (const ttp of teeTimePlayersResult.data || []) {
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

  // Prepare Phase 3 inputs
  const scrambleTeamIds = (scrambleMembershipsResult.data || []).map((m) => m.team_id);
  const calcuttaContest = calcuttaResult.data;
  const needCalcuttaSold = calcuttaContest && calcuttaContest.calcutta_active_order === null;

  // ── Phase 3: conditional follow-ups in parallel ──
  const [teamTeeTimesResult, calcuttaSoldResult] = await Promise.all([
    scrambleTeamIds.length > 0
      ? queryClient.from("tee_times").select("id, trip_id, day_number, tee_time, starting_hole, scramble_team_id").eq("trip_id", trip.id).in("scramble_team_id", scrambleTeamIds)
      : Promise.resolve({ data: null as null }),
    needCalcuttaSold
      ? queryClient.from("contest_participants").select("id", { count: "exact", head: true }).eq("contest_id", calcuttaContest!.id).not("sold_at", "is", null)
      : Promise.resolve({ count: 0 as number | null }),
  ]);

  // Source 2: Scramble teams linked to tee times
  for (const tt of teamTeeTimesResult.data || []) {
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

  // Derive activeRound: user's scramble tee time for today
  const todayForActiveRound = await getEffectiveDate();
  const startForActiveRound = new Date(trip.start_date + "T00:00:00");
  const diffForActiveRound = Math.floor((todayForActiveRound.getTime() - startForActiveRound.getTime()) / (1000 * 60 * 60 * 24));
  const todayDayNumber = diffForActiveRound + 1;

  const todayTeamTeeTime = (teamTeeTimesResult.data || [])
    .find(tt => tt.day_number === todayDayNumber && tt.scramble_team_id);

  let activeRound: { teamId: string; teeTime: string; startingHole: number | null } | null = null;
  if (todayTeamTeeTime?.tee_time && todayTeamTeeTime.scramble_team_id) {
    activeRound = {
      teamId: todayTeamTeeTime.scramble_team_id as string,
      teeTime: todayTeamTeeTime.tee_time as string,
      startingHole: todayTeamTeeTime.starting_hole as number | null,
    };
  }

  // Derive KGB Cup active round: user's direct tee time on a ryder_cup day
  let kgbCupActiveRound: { teeTime: string; startingHole: number | null } | null = null;
  const hasRyderCup = (contestTypesResult.data || []).some(
    (c: { contest_type: string }) => c.contest_type === "ryder_cup"
  );
  if (hasRyderCup) {
    const todayDirectTeeTime = allMatches.find(
      (tt) => tt.dayNumber === todayDayNumber && tt.source === "player"
    );
    if (todayDirectTeeTime?.teeTime) {
      // Verify this day actually has a ryder_cup contest
      const { data: rcContest } = await queryClient
        .from("contests")
        .select("id")
        .eq("trip_id", trip.id)
        .eq("contest_type", "ryder_cup")
        .eq("day_number", todayDayNumber)
        .maybeSingle();
      if (rcContest) {
        kgbCupActiveRound = {
          teeTime: todayDirectTeeTime.teeTime,
          startingHole: todayDirectTeeTime.startingHole,
        };
      }
    }
  }

  // Determine best tee time match
  let bestMatch: TeeTimeMatch | undefined;
  if (allMatches.length > 0) {
    const today = await getEffectiveDate();
    const startDate = new Date(trip.start_date + "T00:00:00");
    const diffDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const todayDayNumber = diffDays + 1;

    bestMatch = allMatches.find((t) => t.dayNumber === todayDayNumber);
    if (!bestMatch) {
      bestMatch = allMatches
        .filter((t) => t.dayNumber > todayDayNumber)
        .sort((a, b) => a.dayNumber - b.dayNumber)[0];
    }
    if (!bestMatch) {
      bestMatch = allMatches.sort((a, b) => a.dayNumber - b.dayNumber)[0];
    }
  }

  const soldCount = (calcuttaSoldResult as { count: number | null }).count || 0;

  // ── Phase 4: teammates + calcutta golfers in parallel ──
  const [teammatesResult, calcuttaGolfersResult] = await Promise.all([
    bestMatch?.source === "scramble" && bestMatch.scrambleTeamId
      ? queryClient.from("scramble_team_members").select("user_id, user:users(display_name)").eq("team_id", bestMatch.scrambleTeamId)
      : bestMatch
        ? queryClient.from("tee_time_players").select("user_id, user:users(display_name)").eq("tee_time_id", bestMatch.teeTimeId)
        : Promise.resolve({ data: null as null }),
    needCalcuttaSold && soldCount > 0
      ? queryClient.from("contest_participants").select("user_id, user:users!contest_participants_user_id_fkey(display_name, avatar_url)").eq("contest_id", calcuttaContest!.id).eq("owner_id", effectiveUserId)
      : Promise.resolve({ data: null as null }),
  ]);

  // Process teammates
  let myTeeTime: string | null = null;
  let myStartingHole: number | null = null;
  let myTeammates: string[] = [];
  let teeTimeDay: string | null = null;

  // Build contest types set and event days lookup
  const contestTypes = [...new Set(
    (contestTypesResult.data || []).map((c: { contest_type: string }) => c.contest_type)
  )];
  const eventDaysData = (eventDaysResult.data || []) as { day_number: number; name: string }[];
  const eventDayNames: Record<number, string> = {};
  for (const ed of eventDaysData) {
    eventDayNames[ed.day_number] = ed.name;
  }

  if (bestMatch) {
    myTeeTime = bestMatch.teeTime;
    myStartingHole = bestMatch.startingHole;

    teeTimeDay = eventDayNames[bestMatch.dayNumber]
      ? `Day ${bestMatch.dayNumber} — ${eventDayNames[bestMatch.dayNumber]}`
      : `Day ${bestMatch.dayNumber}`;

    myTeammates = (teammatesResult.data || [])
      .filter((m) => m.user_id !== effectiveUserId)
      .map((m) => {
        const u = Array.isArray(m.user) ? m.user[0] : m.user;
        return u?.display_name || "Unknown";
      });
  }

  // Process Calcutta roster
  let myCalcuttaRoster: { userId: string; displayName: string; avatarUrl: string | null }[] | null = null;
  if (calcuttaGolfersResult.data && calcuttaGolfersResult.data.length > 0) {
    myCalcuttaRoster = calcuttaGolfersResult.data.map((g) => {
      const u = Array.isArray(g.user) ? g.user[0] : g.user;
      return {
        userId: g.user_id as string,
        displayName: (u as { display_name: string; avatar_url: string | null })?.display_name || "Unknown",
        avatarUrl: (u as { display_name: string; avatar_url: string | null })?.avatar_url || null,
      };
    });
  }

  // Process schedule
  let nextScheduleItem: { title: string; location: string | null; time: string | null; dayLabel: string } | null = null;
  const scheduleItems = scheduleResult.data;
  if (scheduleItems && scheduleItems.length > 0) {
    const today = await getEffectiveDate();
    const tripStart = new Date(trip.start_date + "T00:00:00");
    const diffDays = Math.floor((today.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
    const todayDayNumber = diffDays + 1;
    const todayStr = today.toISOString().split("T")[0];

    const nowHours = today.getHours().toString().padStart(2, "0");
    const nowMinutes = today.getMinutes().toString().padStart(2, "0");
    const nowTime = `${nowHours}:${nowMinutes}`;

    const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const preEvent = scheduleItems.filter((i) => i.day_number === null);
    const tripDays = scheduleItems.filter((i) => i.day_number !== null);

    type FoundItem = (typeof scheduleItems)[number];
    let found: FoundItem | undefined;

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
      found = tripDays.find(
        (item) => item.day_number === todayDayNumber && (!item.start_time || item.start_time > nowTime)
      );
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
        dayLabel = eventDayNames[found.day_number]
          ? `Day ${found.day_number} — ${eventDayNames[found.day_number]}`
          : `Day ${found.day_number}`;
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

  return (
    <HomeContent
      displayName={profile?.display_name || "Loozer"}
      trip={trip}
      incompleteActionCount={incompleteActionCount}
      totalActionCount={totalActionCount}
      rsvpLikelihood={rsvpLikelihood}
      myTeeTime={trip?.show_tee_times ? myTeeTime : null}
      myStartingHole={trip?.show_tee_times ? myStartingHole : null}
      myTeammates={trip?.show_tee_times ? myTeammates : []}
      teeTimeDay={trip?.show_tee_times ? teeTimeDay : null}
      simulatedDate={simDate}
      participants={participants}
      nextScheduleItem={nextScheduleItem}
      timezone={trip?.timezone}
      courseName={courseVenue}
      myCalcuttaRoster={myCalcuttaRoster}
      contestTypes={contestTypes}
      activeRound={activeRound}
      kgbCupActiveRound={kgbCupActiveRound}
    />
  );
}
