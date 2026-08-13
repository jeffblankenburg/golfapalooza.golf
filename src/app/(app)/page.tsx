import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { HomeContent } from "@/components/HomeContent";
import { getEffectiveUserId, getEffectiveDate, getSimDate, isSimulating, getEffectiveTripId } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";
import { stripMarkdown } from "@/lib/strip-markdown";
import { getBirthdaysToday } from "@/lib/birthday/today";
import { userHasClosedPolls, loadActivePollsForUser } from "@/lib/polls";

export { zoomableViewport as viewport } from "@/lib/viewport";

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
      .eq("id", (await getEffectiveTripId())!)
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
        initialBirthdays={[]}
      />
    );
  }

  // Admin client for queries that must bypass RLS (e.g., all users' birthdays)
  const adminClient = createAdminClient();

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
    pickemGamesResult,
    financialsResult,
    optionSettingsResult,
    requiredOptionsResult,
    optionSelectionsResult,
    allOptionSelectionsResult,
    latestArticleResult,
    birthdaysResult,
    activePollsResult,
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
    // All participants who've responded — grouped on the home page by
    // their `likelihood` bucket (99/75/50/25). Loozers who haven't
    // responded yet (NULL) are excluded so the box stays focused on
    // people who've actually weighed in.
    queryClient.from("event_participants").select("user_id, likelihood, likelihood_set_at, user:users(display_name, avatar_url)").eq("trip_id", trip.id).not("likelihood", "is", null),
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
    // Earliest pickem game time
    supabase.from("pickem_games").select("game_time, contest:contests!pickem_games_contest_id_fkey(trip_id)").order("game_time").limit(1),
    // Financial transactions for balance card
    queryClient.from("financial_transactions").select("type, amount").eq("user_id", effectiveUserId),
    // Options settings (deadline)
    supabase.from("trip_option_settings").select("selection_deadline, is_open").eq("trip_id", trip.id).maybeSingle(),
    // Required trip options — used to decide whether the user has "completed" their options
    supabase.from("trip_options").select("id, option_type").eq("trip_id", trip.id).eq("is_required", true),
    // User's option selections (id + value, not just count — needed to verify required-option completeness)
    queryClient.from("user_option_selections").select("option_id, value").eq("trip_id", trip.id).eq("user_id", effectiveUserId),
    // Everyone's selections — used to compute per-participant completion
    // booleans for the Responses card. Admin client bypasses RLS since
    // regular users can't read other users' selections, but we only
    // expose the derived boolean to the client, not the raw values.
    adminClient.from("user_option_selections").select("user_id, option_id, value").eq("trip_id", trip.id),
    // Latest published article (within last 14 days)
    supabase
      .from("articles")
      .select("id, title, content, publish_at, featured_image_url, featured_image_focal_x, featured_image_focal_y, featured_image:gallery_items!articles_featured_image_id_fkey(media_url, thumbnail_url)")
      .eq("trip_id", trip.id)
      .not("publish_at", "is", null)
      .lte("publish_at", new Date().toISOString())
      .gte("publish_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
      .order("publish_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Today's birthdays (prefetched so the banner doesn't flash in)
    getBirthdaysToday(adminClient, trip.timezone || "America/New_York"),
    // Active polls for this user (SSR-prefetched so the fuchsia banners don't pop in late)
    loadActivePollsForUser(adminClient, effectiveUserId),
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

  // Per-participant options completion. Same predicate as the
  // hasCompletedOptions check further down, but driven off the
  // all-users selections fetch and grouped per user_id.
  const requiredOptionsForCompletion =
    (requiredOptionsResult.data || []) as { id: string; option_type: string }[];
  const selectionsByUser = new Map<string, Map<string, unknown>>();
  for (const row of (allOptionSelectionsResult.data || []) as { user_id: string; option_id: string; value: unknown }[]) {
    let inner = selectionsByUser.get(row.user_id);
    if (!inner) {
      inner = new Map();
      selectionsByUser.set(row.user_id, inner);
    }
    inner.set(row.option_id, row.value);
  }
  function userHasCompletedOptions(userId: string): boolean {
    if (requiredOptionsForCompletion.length === 0) return false;
    const map = selectionsByUser.get(userId);
    if (!map) return false;
    return requiredOptionsForCompletion.every((o) => {
      const v = map.get(o.id);
      if (v === null || v === undefined || v === false) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === "string" && v.trim() === "") return false;
      if (o.option_type === "quantity") {
        return v !== null && typeof v === "object" && !Array.isArray(v);
      }
      return true;
    });
  }

  // Participants
  const participants = (participantsResult.data || []).map((p) => {
    const u = Array.isArray(p.user) ? p.user[0] : p.user;
    const typed = u as { display_name: string; avatar_url: string | null } | null;
    const userId = p.user_id as string;
    return {
      userId,
      likelihood: p.likelihood as number,
      likelihoodSetAt: (p.likelihood_set_at as string | null) ?? null,
      displayName: typed?.display_name || "Unknown",
      avatarUrl: typed?.avatar_url || null,
      hasCompletedOptions: userHasCompletedOptions(userId),
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

  // Prepare KGB Cup inputs
  const hasRyderCup = (contestTypesResult.data || []).some(
    (c: { contest_type: string }) => c.contest_type === "ryder_cup"
  );

  // ── Phase 3: conditional follow-ups in parallel ──
  const [teamTeeTimesResult, calcuttaSoldResult, ryderCupContestsResult] = await Promise.all([
    scrambleTeamIds.length > 0
      ? queryClient.from("tee_times").select("id, trip_id, day_number, tee_time, starting_hole, scramble_team_id").eq("trip_id", trip.id).in("scramble_team_id", scrambleTeamIds)
      : Promise.resolve({ data: null as null }),
    needCalcuttaSold
      ? queryClient.from("contest_participants").select("id", { count: "exact", head: true }).eq("contest_id", calcuttaContest!.id).not("sold_at", "is", null)
      : Promise.resolve({ count: 0 as number | null }),
    hasRyderCup
      ? queryClient.from("contests").select("id, day_number, scoring_closed_at").eq("trip_id", trip.id).eq("contest_type", "ryder_cup")
      : Promise.resolve({ data: null as null }),
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

  // Derive day number for best-match logic below
  const todayForActiveRound = await getEffectiveDate();
  const startForActiveRound = new Date(trip.start_date + "T00:00:00");
  const diffForActiveRound = Math.floor((todayForActiveRound.getTime() - startForActiveRound.getTime()) / (1000 * 60 * 60 * 24));
  const todayDayNumber = diffForActiveRound + 1;

  // Derive active scramble rounds — look up contest_id and scoring state in one pass
  // Fetch scramble teams and their contest state in parallel
  const scrambleTeamContestMap = new Map<string, string>();
  const scrambleContestDayMap = new Map<string, number>();
  const scrambleContestScoringOpen = new Set<string>();

  if (scrambleTeamIds.length > 0) {
    const { data: teamContests } = await queryClient
      .from("scramble_teams")
      .select("id, contest_id, contest:contests!inner(id, day_number, scoring_closed_at)")
      .in("id", scrambleTeamIds);
    for (const tc of teamContests || []) {
      scrambleTeamContestMap.set(tc.id, tc.contest_id);
      const contest = Array.isArray(tc.contest) ? tc.contest[0] : tc.contest;
      if (contest) {
        if (contest.day_number) scrambleContestDayMap.set(contest.id, contest.day_number);
        if (!contest.scoring_closed_at) scrambleContestScoringOpen.add(contest.id);
      }
    }
  }

  const activeRounds: { teamId: string; teeTime: string; startingHole: number | null; contestId: string; dayNumber: number }[] = [];
  for (const tt of teamTeeTimesResult.data || []) {
    if (tt.tee_time && tt.scramble_team_id) {
      const contestId = scrambleTeamContestMap.get(tt.scramble_team_id as string);
      if (contestId && scrambleContestScoringOpen.has(contestId)) {
        activeRounds.push({
          teamId: tt.scramble_team_id as string,
          teeTime: tt.tee_time as string,
          startingHole: tt.starting_hole as number | null,
          contestId,
          dayNumber: scrambleContestDayMap.get(contestId) || (tt.day_number as number),
        });
      }
    }
  }
  // Sort by day number
  activeRounds.sort((a, b) => a.dayNumber - b.dayNumber);

  // Derive KGB Cup active round — use pre-fetched ryder cup contests
  let kgbCupActiveRound: { teeTime: string; startingHole: number | null } | null = null;
  if (hasRyderCup) {
    const playerTeeTime = allMatches.find((tt) => tt.source === "player");
    if (playerTeeTime?.teeTime) {
      const dayNum = playerTeeTime.dayNumber;
      const rcContest = (ryderCupContestsResult.data || []).find(
        (c: { day_number: number | null }) => c.day_number === dayNum
      );
      if (rcContest && !rcContest.scoring_closed_at) {
        kgbCupActiveRound = {
          teeTime: playerTeeTime.teeTime,
          startingHole: playerTeeTime.startingHole,
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

  // ── Phase 4: teammates + calcutta golfers + winnings + buyer paid in parallel ──
  const [teammatesResult, calcuttaGolfersResult, winningsResult, buyerPaidResult] = await Promise.all([
    bestMatch?.source === "scramble" && bestMatch.scrambleTeamId
      ? queryClient.from("scramble_team_members").select("user_id, user:users(display_name)").eq("team_id", bestMatch.scrambleTeamId)
      : bestMatch
        ? queryClient.from("tee_time_players").select("user_id, user:users(display_name)").eq("tee_time_id", bestMatch.teeTimeId)
        : Promise.resolve({ data: null as null }),
    needCalcuttaSold && soldCount > 0
      ? queryClient.from("calcutta_ownership").select("share_pct, participant:contest_participants!inner(user_id, user:users!contest_participants_user_id_fkey(display_name, avatar_url))").eq("owner_id", effectiveUserId)
      : Promise.resolve({ data: null as null }),
    // Fetch contest winners for winnings calculation
    calcuttaContest
      ? queryClient.from("contest_winners").select("prize_id, user_id").then((r) => r)
      : Promise.resolve({ data: null as null }),
    // Check if buyer has paid
    calcuttaContest
      ? queryClient.from("calcutta_buyer_paid").select("id").eq("contest_id", calcuttaContest.id).eq("user_id", effectiveUserId).maybeSingle()
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
  let myCalcuttaRoster: { userId: string; displayName: string; avatarUrl: string | null; sharePct: number }[] | null = null;
  if (calcuttaGolfersResult.data && calcuttaGolfersResult.data.length > 0) {
    myCalcuttaRoster = calcuttaGolfersResult.data.map((g) => {
      const p = Array.isArray(g.participant) ? g.participant[0] : g.participant;
      const u = p ? (Array.isArray((p as { user: unknown }).user) ? ((p as { user: unknown[] }).user)[0] : (p as { user: unknown }).user) : null;
      return {
        userId: (p as { user_id: string })?.user_id || "",
        displayName: (u as { display_name: string; avatar_url: string | null })?.display_name || "Unknown",
        avatarUrl: (u as { display_name: string; avatar_url: string | null })?.avatar_url || null,
        sharePct: g.share_pct as number,
      };
    });
  }

  // Process calcutta buyer owes + winnings — batch fetch ownership, pool, and prizes
  let calcuttaBuyerOwes = 0;
  let myWinnings: { total: number; breakdown: { prizeName: string; amount: number }[] } | null = null;

  if (calcuttaContest) {
    // Fetch ownership (with participant data for winnings) + pool + prizes in parallel
    const [ownershipResult, poolResult, prizesResult] = await Promise.all([
      queryClient
        .from("calcutta_ownership")
        .select("participant_id, share_pct, amount_paid, participant:contest_participants!inner(user_id)")
        .eq("owner_id", effectiveUserId),
      queryClient
        .from("contest_participants")
        .select("bid_amount")
        .eq("contest_id", calcuttaContest.id)
        .not("bid_amount", "is", null),
      queryClient
        .from("calcutta_prizes")
        .select("id, prize_name, percentage, linked_contest:contests!calcutta_prizes_linked_contest_id_fkey(name)")
        .eq("contest_id", calcuttaContest.id),
    ]);

    const myOwnership = ownershipResult.data || [];

    // Calculate buyer owes (if not already paid)
    if (!buyerPaidResult.data && myOwnership.length > 0) {
      for (const o of myOwnership) {
        calcuttaBuyerOwes += Number(o.amount_paid) || 0;
      }
    }

    // Calculate winnings
    if (winningsResult.data && winningsResult.data.length > 0 && myOwnership.length > 0) {
      const ownedUserIds = new Set(
        myOwnership.map((o) => {
          const p = Array.isArray(o.participant) ? o.participant[0] : o.participant;
          return (p as { user_id: string })?.user_id;
        }).filter(Boolean)
      );

      const shareByUser: Record<string, number> = {};
      for (const o of myOwnership) {
        const p = Array.isArray(o.participant) ? o.participant[0] : o.participant;
        const uid = (p as { user_id: string })?.user_id;
        if (uid) shareByUser[uid] = o.share_pct;
      }

      const pool = (poolResult.data || []).reduce((s, p) => s + (Number(p.bid_amount) || 0), 0);
      const prizes = prizesResult.data || [];

      // Check which contest_winners match owned players
      const winnerRows = winningsResult.data as { prize_id: string; user_id: string }[];
      const breakdown: { prizeName: string; amount: number }[] = [];
      let total = 0;

      const prizeMap = new Map((prizes || []).map((p) => [p.id, p]));

      // Group winners by prize
      const winnersByPrize: Record<string, string[]> = {};
      for (const w of winnerRows) {
        if (!winnersByPrize[w.prize_id]) winnersByPrize[w.prize_id] = [];
        winnersByPrize[w.prize_id].push(w.user_id);
      }

      for (const [prizeId, userIds] of Object.entries(winnersByPrize)) {
        const prize = prizeMap.get(prizeId);
        if (!prize) continue;

        const totalPayout = pool * prize.percentage / 100;
        const perPlayerPayout = totalPayout / userIds.length;
        const lc = Array.isArray(prize.linked_contest) ? prize.linked_contest[0] : prize.linked_contest;
        const prizeName = (lc as { name: string } | null)?.name || prize.prize_name || "Prize";

        let prizeEarnings = 0;
        for (const uid of userIds) {
          if (ownedUserIds.has(uid) && shareByUser[uid]) {
            prizeEarnings += perPlayerPayout * (shareByUser[uid] / 100);
          }
        }

        if (prizeEarnings > 0) {
          breakdown.push({ prizeName, amount: prizeEarnings });
          total += prizeEarnings;
        }
      }

      if (total > 0) {
        myWinnings = { total, breakdown };
      }
    }
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

  // Process financial balance
  const financialTxns = financialsResult.data || [];
  const totalCharges = financialTxns
    .filter((t: { type: string; amount: number }) => t.type === "charge")
    .reduce((sum: number, t: { amount: number }) => sum + Number(t.amount), 0);
  const totalPayments = financialTxns
    .filter((t: { type: string; amount: number }) => t.type === "payment")
    .reduce((sum: number, t: { amount: number }) => sum + Number(t.amount), 0);
  const myBalance = financialTxns.length > 0
    ? { charges: totalCharges, payments: totalPayments, balance: totalPayments - totalCharges }
    : null;

  // Options deadline
  const optionSettings = optionSettingsResult.data as { selection_deadline: string | null; is_open: boolean } | null;
  const optionsDeadline = optionSettings?.is_open && optionSettings.selection_deadline
    ? optionSettings.selection_deadline
    : null;
  // "Completed" mirrors the SelectionSummary admin page: every required option has a non-empty value.
  const requiredOptions = (requiredOptionsResult.data || []) as { id: string; option_type: string }[];
  const userSelectionMap = new Map<string, unknown>(
    (optionSelectionsResult.data || []).map((s) => [s.option_id as string, s.value])
  );
  const hasCompletedOptions = requiredOptions.every((o) => {
    const v = userSelectionMap.get(o.id);
    if (v === null || v === undefined || v === false) return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (typeof v === "string" && v.trim() === "") return false;
    if (o.option_type === "quantity") {
      return v !== null && typeof v === "object" && !Array.isArray(v);
    }
    return true;
  });

  // Check if pickem picks are urgent (within 3 hours of first game)
  const pickemFirstGame = (pickemGamesResult.data || []).find(
    (g) => {
      const c = Array.isArray(g.contest) ? g.contest[0] : g.contest;
      return c?.trip_id === trip.id;
    }
  );
  const pickemUrgent = await (async () => {
    if (!pickemFirstGame) return false;
    const gameTime = new Date(pickemFirstGame.game_time).getTime();
    const now = (await getEffectiveDate()).getTime();
    const threeHours = 3 * 60 * 60 * 1000;
    return now >= gameTime - threeHours && now < gameTime;
  })();

  // Build visibility context
  const effectiveDate = await getEffectiveDate();
  const visCtx = {
    start_date: trip.start_date,
    visibility_overrides: (trip.visibility_overrides as Record<string, boolean>) || {},
  };

  // Gate tee time card
  const teeTimesVisible = isFeatureVisible("tee_times", visCtx, effectiveDate);

  // Gate scoring cards — per-player tee time window
  const scoringVisible = (teeTime: string | null, dayNumber: number | null) =>
    isFeatureVisible("scoring", visCtx, effectiveDate, {
      playerTeeTime: teeTime,
      teeTimeDayNumber: dayNumber,
    });

  // Filter active rounds to only those in the scoring window
  const visibleActiveRounds = activeRounds.filter((r) =>
    scoringVisible(r.teeTime, r.dayNumber)
  );

  // Gate KGB Cup scoring card
  const kgbVisible = kgbCupActiveRound
    ? scoringVisible(
        kgbCupActiveRound.teeTime,
        allMatches.find((m) => m.source === "player")?.dayNumber ?? null
      )
    : false;

  // Quick-link visibility: the scoring leaderboards (Scrambles, Skins, 100
  // Feet, Daily Games) always show when their contest exists — each
  // destination page renders its own pre-event empty state via
  // isFeatureVisible. Rooms stays time-gated (lodging info is private until
  // close to the trip). Options/Polls hide when there's nothing to see.
  const hiddenQuickLinks: string[] = [];
  if (!isFeatureVisible("rooms", visCtx, effectiveDate)) hiddenQuickLinks.push("/rooms");
  if (!optionsDeadline) hiddenQuickLinks.push("/options");
  if (!(await userHasClosedPolls(adminClient, effectiveUserId))) hiddenQuickLinks.push("/polls");
  // Shirt Guide only appears once an admin has posted at least one shirt.
  const { count: shirtCount } = await adminClient
    .from("event_shirts")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", trip.id);
  if (!shirtCount) hiddenQuickLinks.push("/shirt-guide");

  return (
    <HomeContent
      displayName={profile?.display_name || "Loozer"}
      trip={trip}
      incompleteActionCount={incompleteActionCount}
      totalActionCount={totalActionCount}
      rsvpLikelihood={rsvpLikelihood}
      myTeeTime={teeTimesVisible ? myTeeTime : null}
      myStartingHole={teeTimesVisible ? myStartingHole : null}
      myTeammates={teeTimesVisible ? myTeammates : []}
      teeTimeDay={teeTimesVisible ? teeTimeDay : null}
      teeTimeLinkHref={bestMatch?.source === "player" ? "/kgb-cup" : bestMatch ? `/scrambles?day=${bestMatch.dayNumber}` : "/scrambles"}
      simulatedDate={simDate}
      initialBirthdays={birthdaysResult}
      participants={participants}
      nextScheduleItem={nextScheduleItem}
      timezone={trip?.timezone}
      courseName={courseVenue}
      myCalcuttaRoster={myCalcuttaRoster}
      calcuttaBuyerOwes={calcuttaBuyerOwes}
      contestTypes={contestTypes}
      activeRounds={visibleActiveRounds}
      kgbCupActiveRound={kgbVisible ? kgbCupActiveRound : null}
      calcuttaAuctionActive={calcuttaContest?.calcutta_active_order != null && calcuttaContest.calcutta_active_order > 0}
      pickemUrgent={pickemUrgent}
      myWinnings={myWinnings}
      myBalance={myBalance}
      optionsDeadline={optionsDeadline}
      hasCompletedOptions={hasCompletedOptions}
      showOptionsCompletion={optionSettings?.is_open === true && requiredOptionsForCompletion.length > 0}
      latestArticle={latestArticleResult.data ? (() => {
        const d = latestArticleResult.data;
        const img = Array.isArray(d.featured_image) ? d.featured_image[0] : d.featured_image;
        // Extract first ~150 chars of content as preview, strip markdown
        const preview = stripMarkdown(d.content || "", 300);
        return {
          id: d.id,
          title: d.title,
          publishAt: d.publish_at,
          imageUrl: img?.media_url || img?.thumbnail_url || d.featured_image_url || null,
          preview: preview || null,
          focalX: d.featured_image_focal_x ?? 50,
          focalY: d.featured_image_focal_y ?? 50,
        };
      })() : null}
      hiddenQuickLinks={hiddenQuickLinks}
      initialActivePolls={activePollsResult}
    />
  );
}
