// Shared loader for a single Loozer's profile. Used by:
//   - /api/loozers/{userId} (client fetches)
//   - /loozers/{userId} server page (SSR; eliminates a client waterfall)

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveDate, getEffectiveTripId } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";
import { isRoundIncomplete, expectedHoleCount } from "@/lib/rounds/incomplete";

export interface LoozerProfileResponse {
  profile: {
    id: string;
    display_name: string;
    full_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    city: string | null;
    state: string | null;
    playing_since: number | null;
    swings: string | null;
    typical_shot: string | null;
    fun_fact: string | null;
    best_shot: string | null;
    occupation: string | null;
    eight_bag_average: number | null;
    avg_scramble_score: number | null;
    is_founder: boolean | null;
    sponsor_id: string | null;
  };
  accolades: unknown[];
  taggedPhotos: unknown[];
  taggedPhotosCount: number;
  handicapIndex: number | null;
  eightBagAverage: number | null;
  avgScrambleScore: number | null;
  bio: { content: string } | null;
  song: { id: string; title: string; mp3_url: string; art_url: string | null } | null;
  scorecards: Array<{
    roundId: string;
    roundDate: string;
    roundType: string;
    courseName: string;
    score: number;
    par: number;
    scoreToPar: number;
    differential: number | null;
    isIncomplete: boolean;
    holesPlayed: number;
    expectedHoles: number;
  }>;
  isFounder: boolean;
  sponsor: { id: string; display_name: string; avatar_url: string | null } | null;
  eventsAttended: number;
  currentRoomNumber: string | null;
}

export async function loadLoozerProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryClient: SupabaseClient<any, "public", any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, "public", any>,
  userId: string,
): Promise<LoozerProfileResponse | null> {
  const [
    { data: profile, error: profileError },
    { data: accolades },
    { data: taggedRows, count: taggedPhotosCount },
    { data: handicapRow },
    { data: bioData },
    { data: song },
    { data: teamMemberships },
    { data: attendedRows },
    { data: activeTrip },
  ] = await Promise.all([
    queryClient
      .from("users")
      .select(
        "id, display_name, full_name, avatar_url, phone, city, state, playing_since, swings, typical_shot, fun_fact, best_shot, occupation, eight_bag_average, avg_scramble_score, is_founder, sponsor_id",
      )
      .eq("id", userId)
      .single(),
    queryClient
      .from("accolades")
      .select(
        "id, title, category, user_id, partner_user_id, trip:trip_settings(trip_year), winner:users!accolades_user_id_fkey(id, display_name, full_name, avatar_url), partner:users!accolades_partner_user_id_fkey(id, display_name, full_name, avatar_url), category_meta:accolade_categories!accolades_category_fkey(category, title, short_label, icon, icon_url, description, sort_order)",
      )
      .or(`user_id.eq.${userId},partner_user_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    queryClient
      .from("gallery_tags")
      .select("item:gallery_items(id, media_url, thumbnail_url, media_type, created_at)", {
        count: "exact",
      })
      .eq("tagged_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
    adminClient
      .from("player_handicaps")
      .select("handicap_index")
      .eq("user_id", userId)
      .maybeSingle(),
    adminClient
      .from("loozer_bios")
      .select("content")
      .eq("user_id", userId)
      .eq("is_visible", true)
      .maybeSingle(),
    adminClient
      .from("songs")
      .select("id, title, mp3_url, art_url")
      .eq("tagged_user_id", userId)
      .limit(1)
      .maybeSingle(),
    adminClient
      .from("rounds")
      .select(`
        id, round_date, round_type, status,
        course:courses(name),
        round_players!inner(
          id, user_id, final_gross_score, score_differential, tee_id,
          player_tee:course_tees(id, par)
        )
      `)
      .eq("round_players.user_id", userId)
      .not("round_players.final_gross_score", "is", null)
      .order("round_date", { ascending: false })
      .limit(10),
    // Every trip year the user is rostered for. Historical workbook rows
    // were unified into event_participants by migration 00133. Counts
    // DISTINCT trip YEARS (a year may carry >1 trip, e.g. 2026's live event
    // + '🧪 Test Event' sandbox); 'test'/'draft' sandboxes are excluded.
    adminClient
      .from("event_participants")
      .select("trip_settings!inner(trip_year, status)")
      .eq("user_id", userId)
      .eq("on_roster", true)
      .in("trip_settings.status", ["active", "archived"]),
    // Active trip — needed for the during-event room number badge below.
    // Routed through getEffectiveTripId so admin sim mode sees the test event.
    (async () => {
      const tripId = await getEffectiveTripId();
      if (!tripId) return { data: null };
      return adminClient
        .from("trip_settings")
        .select("id, start_date, visibility_overrides")
        .eq("id", tripId)
        .maybeSingle();
    })(),
  ]);

  if (profileError || !profile) return null;

  // Distinct trip years the user attended (a year may carry >1 trip; the
  // '🧪 Test Event' sandbox is already filtered out by the query above).
  const eventsAttendedYears = new Set<number>();
  for (const r of attendedRows || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const trip: any = Array.isArray(r.trip_settings) ? r.trip_settings[0] : r.trip_settings;
    if (trip?.trip_year != null) eventsAttendedYears.add(trip.trip_year);
  }

  const sponsorId = (profile as { sponsor_id: string | null }).sponsor_id;
  let sponsor: { id: string; display_name: string; avatar_url: string | null } | null = null;
  if (sponsorId) {
    const { data: sponsorRow } = await queryClient
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("id", sponsorId)
      .maybeSingle();
    if (sponsorRow) {
      sponsor = sponsorRow as { id: string; display_name: string; avatar_url: string | null };
    }
  }

  const bioNote = bioData && bioData.content ? { content: bioData.content as string } : null;

  const taggedPhotos = ((taggedRows as Array<{ item: unknown }>) || [])
    .map((row) => (Array.isArray(row.item) ? row.item[0] : row.item))
    .filter(Boolean);

  // For 9-hole rounds we need the par of just the played holes — not the
  // tee's full 18-hole par. Batch-fetch per-hole pars for every tee that
  // backs a non-18 scorecard so we don't N+1 the DB.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRounds = (teamMemberships as any[]) || [];
  const nineHoleTeeIds = new Set<string>();
  for (const r of rawRounds) {
    if (r.round_type === "18") continue;
    const players = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = players.find((p: { user_id: string }) => p.user_id === userId) || players[0];
    if (player?.tee_id) nineHoleTeeIds.add(player.tee_id);
  }
  const nineHoleParByTee = new Map<string, { front: number; back: number }>();
  if (nineHoleTeeIds.size > 0) {
    const { data: holes } = await adminClient
      .from("course_holes")
      .select("tee_id, hole_number, par")
      .in("tee_id", [...nineHoleTeeIds]);
    for (const h of holes || []) {
      const entry = nineHoleParByTee.get(h.tee_id) || { front: 0, back: 0 };
      if (h.hole_number <= 9) entry.front += h.par;
      else entry.back += h.par;
      nineHoleParByTee.set(h.tee_id, entry);
    }
  }

  // Count scored holes per player to flag incomplete (partially played) rounds.
  const scorecardPlayerIds: string[] = [];
  for (const r of rawRounds) {
    const players = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = players.find((p: { user_id: string }) => p.user_id === userId) || players[0];
    if (player?.id) scorecardPlayerIds.push(player.id);
  }
  const holesByPlayer = new Map<string, number>();
  if (scorecardPlayerIds.length > 0) {
    const { data: scoreRows } = await adminClient
      .from("round_scores")
      .select("round_player_id")
      .in("round_player_id", scorecardPlayerIds);
    for (const s of scoreRows || []) {
      holesByPlayer.set(s.round_player_id, (holesByPlayer.get(s.round_player_id) || 0) + 1);
    }
  }

  const scorecards = rawRounds
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => {
      const players = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
      const player = players.find((p: { user_id: string }) => p.user_id === userId) || players[0];
      if (!player?.final_gross_score) return null;
      const course = Array.isArray(r.course) ? r.course[0] : r.course;
      const playerTee = player.player_tee
        ? Array.isArray(player.player_tee)
          ? player.player_tee[0]
          : player.player_tee
        : null;
      const teePar = playerTee?.par || 72;
      let par = teePar;
      if (r.round_type !== "18" && player.tee_id) {
        const split = nineHoleParByTee.get(player.tee_id);
        if (split) {
          par = r.round_type === "9-back" ? split.back : split.front;
        } else {
          par = Math.round(teePar / 2);
        }
      }
      const holesPlayed = player.id ? (holesByPlayer.get(player.id) || 0) : 0;
      return {
        roundId: r.id as string,
        roundDate: r.round_date as string,
        roundType: r.round_type as string,
        courseName: (course?.name as string) || "Unknown",
        score: player.final_gross_score as number,
        par,
        scoreToPar: (player.final_gross_score as number) - par,
        differential: (player.score_differential as number) ?? null,
        isIncomplete: isRoundIncomplete(r.round_type, holesPlayed, player.final_gross_score != null),
        holesPlayed,
        expectedHoles: expectedHoleCount(r.round_type),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  // Room number — only surfaced during the rooms-visible window
  // (1 week before trip start through trip end). Same gate that controls
  // the Rooms quick link, so the room number appears on profile around
  // the same time players start checking lodging.
  let currentRoomNumber: string | null = null;
  if (activeTrip) {
    const trip = activeTrip as {
      id: string;
      start_date: string;
      visibility_overrides: Record<string, boolean> | null;
    };
    const now = await getEffectiveDate();
    const visible = isFeatureVisible(
      "rooms",
      { start_date: trip.start_date, visibility_overrides: trip.visibility_overrides || {} },
      now,
    );
    if (visible) {
      const { data: assignment } = await adminClient
        .from("room_assignments")
        .select("room:rooms(room_number)")
        .eq("user_id", userId)
        .eq("trip_id", trip.id)
        .maybeSingle();
      const room = assignment
        ? (Array.isArray(assignment.room) ? assignment.room[0] : assignment.room)
        : null;
      currentRoomNumber = (room?.room_number as string) ?? null;
    }
  }

  const profileOut = profile;

  return {
    profile: profileOut as LoozerProfileResponse["profile"],
    accolades: accolades || [],
    taggedPhotos,
    taggedPhotosCount: taggedPhotosCount ?? 0,
    handicapIndex: (handicapRow?.handicap_index as number) ?? null,
    eightBagAverage: profileOut.eight_bag_average ?? null,
    avgScrambleScore: profileOut.avg_scramble_score ?? null,
    bio: bioNote,
    song: (song as LoozerProfileResponse["song"]) ?? null,
    scorecards,
    isFounder: profileOut.is_founder === true,
    sponsor,
    eventsAttended: eventsAttendedYears.size,
    currentRoomNumber,
  };
}
