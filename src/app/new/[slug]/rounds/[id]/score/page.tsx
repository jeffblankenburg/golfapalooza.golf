import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { pickName } from "@/lib/v2/profile";
import { formatCourseName } from "@/lib/v2/course-display";
import { calculateCourseHandicap, strokesReceivedOnHole } from "@/lib/v2/golf/calculator";
import ScoreEntry, { type ScoreHole, type ScorePlayer } from "./ScoreEntry";
import { type RoundGame } from "./SideGameStandings";

type StatKey = "putts" | "fairways" | "gir" | "penalties";
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Full-screen hole-by-hole / live scorer for a v2 round. Personal & global —
 * gated to players on the round (or its creator). Outside the (event) route
 * group so it renders full-screen without the shell nav.
 */
export default async function ScorePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect(`/new/signup?org=${encodeURIComponent(slug)}`);
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const admin = v2AdminClient();
  const { data: round } = await admin
    .from("v2_rounds")
    .select("id, status, round_type, format, created_by, tee_id, course:v2_courses(name, club_name)")
    .eq("id", id)
    .maybeSingle();
  if (!round) redirect(`/new/${slug}`);

  const { data: roster } = await admin
    .from("v2_round_players")
    .select("id, user_id, guest_name, tee_id, player_position, profile:v2_profiles(display_name, first_name, last_name, nickname), player_tee:v2_course_tees!v2_round_players_tee_id_fkey(tee_name, tee_color, course_rating, slope_rating, par)")
    .eq("round_id", id)
    .order("player_position", { ascending: true });

  const isPlayer = (roster || []).some((r) => r.user_id === ctx.userId);
  if (round.created_by !== ctx.userId && !isPlayer) redirect(`/new/${slug}`);

  // Holes from the round tee (composition-tee resolution is a TODO), filtered to
  // the round's nine.
  const inNine = (h: number) => (round.round_type === "9-front" ? h <= 9 : round.round_type === "9-back" ? h >= 10 : true);
  const { data: holeRows } = round.tee_id
    ? await admin
        .from("v2_course_holes")
        .select(
          "hole_number, par, handicap_index, yards, hole_name, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude, center_line, overhead_image_url, green_image_url",
        )
        .eq("tee_id", round.tee_id)
        .order("hole_number", { ascending: true })
    : { data: [] };
  const holes: ScoreHole[] = (holeRows || [])
    .filter((h) => inNine(h.hole_number))
    .map((h) => ({
      hole_number: h.hole_number,
      par: h.par,
      handicap_index: h.handicap_index,
      yards: h.yards ?? null,
      hole_name: h.hole_name ?? null,
      tee_latitude: h.tee_latitude ?? null,
      tee_longitude: h.tee_longitude ?? null,
      green_latitude: h.green_latitude ?? null,
      green_longitude: h.green_longitude ?? null,
      green_front_latitude: h.green_front_latitude ?? null,
      green_front_longitude: h.green_front_longitude ?? null,
      green_back_latitude: h.green_back_latitude ?? null,
      green_back_longitude: h.green_back_longitude ?? null,
      drive_latitude: h.drive_latitude ?? null,
      drive_longitude: h.drive_longitude ?? null,
      center_line: (h.center_line as [number, number][] | null) ?? null,
      overhead_image_url: h.overhead_image_url ?? null,
      green_image_url: h.green_image_url ?? null,
    }));

  const players: ScorePlayer[] = (roster || []).map((r) => {
    const prof = one(r.profile);
    const tee = one(r.player_tee);
    return {
      id: r.id,
      name: r.user_id ? pickName(prof, org.name_display) : r.guest_name || "Guest",
      isGuest: !r.user_id,
      teeName: tee?.tee_name ?? null,
      teeColor: tee?.tee_color ?? null,
    };
  });

  // Side games on this round (Skins, …) for live standings.
  const { data: gameRows } = await admin
    .from("v2_round_games")
    .select("id, game_type, is_net, participant_ids, config")
    .eq("round_id", id);
  const games: RoundGame[] = (gameRows || []).map((g) => ({
    id: g.id,
    game_type: g.game_type,
    is_net: g.is_net,
    participant_ids: g.participant_ids || [],
    value: typeof g.config?.value === "number" ? g.config.value : null,
  }));

  // Each player's handicap strokes ("pops") per hole, played off the low. Computed
  // always (not only when a net game exists) so switching a game to Net mid-round
  // works, and so the scorecard can show pops the moment a net game is added.
  // The lowest course handicap on the round plays to scratch (0 pops); everyone
  // else's strokes shift down by that amount. Players with no handicap on file
  // (or guests) receive no strokes and don't set the low.
  const strokesByPlayer: Record<string, Record<number, number>> = {};
  {
    const userIds = [...new Set((roster || []).map((r) => r.user_id).filter((u): u is string => !!u))];
    const { data: hcaps } = userIds.length
      ? await admin.from("v2_player_handicaps").select("user_id, handicap_index").in("user_id", userIds)
      : { data: [] };
    const hiByUser = new Map((hcaps || []).map((h) => [h.user_id, h.handicap_index]));

    // First pass: each player's course handicap (null if no handicap / guest).
    const chById = new Map<string, number | null>();
    for (const r of roster || []) {
      const tee = one(r.player_tee);
      const hi = r.user_id ? hiByUser.get(r.user_id) : null;
      chById.set(
        r.id,
        hi == null || tee?.slope_rating == null || tee?.course_rating == null
          ? null
          : calculateCourseHandicap(Number(hi), tee.slope_rating, Number(tee.course_rating), tee.par ?? 72),
      );
    }
    const chValues = [...chById.values()].filter((v): v is number => v != null);
    const low = chValues.length ? Math.min(...chValues) : 0;

    // Second pass: allocate strokes off the relative (played-off-the-low) handicap.
    for (const r of roster || []) {
      const ch = chById.get(r.id);
      if (ch == null) {
        strokesByPlayer[r.id] = {};
        continue;
      }
      const rel = ch - low;
      const m: Record<number, number> = {};
      for (const h of holes) m[h.hole_number] = strokesReceivedOnHole(h.handicap_index, rel);
      strokesByPlayer[r.id] = m;
    }
  }

  // Existing scores, grouped by round_player_id.
  const { data: scoreRows } = await admin
    .from("v2_round_scores")
    .select("round_player_id, hole_number, strokes, putts, fairway_hit, green_in_regulation, penalty_strokes")
    .eq("round_id", id);
  const initialScores: Record<string, Record<number, { strokes: number | null; putts: number | null; fairway_hit: boolean | null; green_in_regulation: boolean | null; penalty_strokes: number | null }>> = {};
  for (const s of scoreRows || []) {
    (initialScores[s.round_player_id] ||= {})[s.hole_number] = {
      strokes: s.strokes,
      putts: s.putts,
      fairway_hit: s.fairway_hit,
      green_in_regulation: s.green_in_regulation,
      penalty_strokes: s.penalty_strokes,
    };
  }

  const { data: me } = await admin.from("v2_profiles").select("tracked_stats").eq("id", ctx.userId).maybeSingle();
  const allowed: StatKey[] = ["putts", "fairways", "gir", "penalties"];
  const trackedStats = (Array.isArray(me?.tracked_stats) ? me!.tracked_stats : ["putts"]).filter((s: unknown): s is StatKey =>
    typeof s === "string" && (allowed as string[]).includes(s),
  );

  const course = one(round.course);
  const roundTeeColor = one(roster?.[0]?.player_tee)?.tee_color ?? null;

  return (
    <div style={{ ["--brand" as string]: org.primary_color || "#0a5c36" } as React.CSSProperties}>
      <ScoreEntry
        slug={slug}
        roundId={round.id}
        courseName={course ? formatCourseName(course) : "Round"}
        holes={holes}
        roundTeeColor={roundTeeColor}
        games={games}
        strokesByPlayer={strokesByPlayer}
        brandColor={org.primary_color || "#0a5c36"}
        players={players}
        initialScores={initialScores}
        trackedStats={trackedStats}
        initialStatus={round.status}
        viewerId={ctx.userId}
        orgId={org.id}
      />
    </div>
  );
}
