// Shared loader for a single Loozer's profile. Used by:
//   - /api/loozers/{userId} (client fetches)
//   - /loozers/{userId} server page (SSR; eliminates a client waterfall)

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEffectiveDate, getEffectiveTripId } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";

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
    { count: eventsAttendedCount },
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
          user_id, final_gross_score, score_differential,
          player_tee:course_tees(par)
        )
      `)
      .eq("round_players.user_id", userId)
      .not("round_players.final_gross_score", "is", null)
      .order("round_date", { ascending: false })
      .limit(10),
    // Single source: every trip the user is rostered for. Historical
    // workbook rows were unified into event_participants by migration 00133.
    adminClient
      .from("event_participants")
      .select("trip_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("on_roster", true),
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scorecards = ((teamMemberships as any[]) || [])
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
      const par = playerTee?.par || 72;
      return {
        roundId: r.id as string,
        roundDate: r.round_date as string,
        roundType: r.round_type as string,
        courseName: (course?.name as string) || "Unknown",
        score: player.final_gross_score as number,
        par,
        scoreToPar: (player.final_gross_score as number) - par,
        differential: (player.score_differential as number) ?? null,
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
    eventsAttended: eventsAttendedCount ?? 0,
    currentRoomNumber,
  };
}
