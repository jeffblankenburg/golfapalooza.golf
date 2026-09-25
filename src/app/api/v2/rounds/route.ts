import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { formatCourseName } from "@/lib/v2/course-display";
import { isRoundIncomplete, expectedHoleCount } from "@/lib/rounds/incomplete";
import { calculateDifferential } from "@/lib/v2/golf/calculator";
import { recalculateHandicap } from "@/lib/v2/golf/handicap";
import { orgSlug, logLiveRound, logRoundScores } from "@/lib/v2/rounds/round-activity";

/**
 * GET /api/v2/rounds — the authed golfer's personal rounds + handicap for the My
 * Rounds drawer. Personal & global: rounds are gathered wherever the user is a
 * player, across every group. Mirrors the legacy My Rounds landing computation
 * (9-hole par via course_holes, incomplete-round detection, avg/best over full
 * 18s). Scramble team rounds are excluded from the personal avg/best aggregates.
 */
export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const [{ data: rounds }, { data: handicapRow }] = await Promise.all([
    admin
      .from("v2_rounds")
      .select(
        `id, round_date, round_type, format, status,
         course:v2_courses(id, name, club_name, city, state),
         tee:v2_course_tees(id, tee_name, tee_color, gender, par),
         players:v2_round_players!inner(
           id, user_id, tee_id, final_gross_score, score_differential,
           player_tee:v2_course_tees(id, tee_name, tee_color, gender, par)
         )`,
      )
      .eq("players.user_id", userId)
      .order("round_date", { ascending: false }),
    admin.from("v2_player_handicaps").select("handicap_index").eq("user_id", userId).maybeSingle(),
  ]);

  const handicapIndex = handicapRow?.handicap_index ?? null;
  const all = rounds || [];
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  // 9-hole rounds need per-nine par (not the tee's 18-hole par). Batch-fetch
  // course_holes for every distinct tee backing a non-18 round.
  const nineHoleTeeIds = new Set<string>();
  for (const r of all) {
    if (r.round_type === "18") continue;
    for (const p of r.players || []) if (p?.tee_id) nineHoleTeeIds.add(p.tee_id);
  }
  const nineHoleParByTee = new Map<string, { front: number; back: number }>();
  if (nineHoleTeeIds.size > 0) {
    const { data: holes } = await admin
      .from("v2_course_holes")
      .select("tee_id, hole_number, par")
      .in("tee_id", [...nineHoleTeeIds]);
    for (const h of holes || []) {
      const entry = nineHoleParByTee.get(h.tee_id) || { front: 0, back: 0 };
      if (h.hole_number <= 9) entry.front += h.par;
      else entry.back += h.par;
      nineHoleParByTee.set(h.tee_id, entry);
    }
  }

  // Count scored holes per player row to flag INCOMPLETE rounds (started but
  // never finished). Quick-entry rounds have zero hole scores + a trusted gross.
  const roundPlayerIds: string[] = [];
  for (const r of all) {
    const p = (r.players || []).find((x) => x?.user_id === userId) || (r.players || [])[0];
    if (p?.id) roundPlayerIds.push(p.id);
  }
  const holesByPlayer = new Map<string, number>();
  if (roundPlayerIds.length > 0) {
    const { data: scoreRows } = await admin
      .from("v2_round_scores")
      .select("round_player_id")
      .in("round_player_id", roundPlayerIds);
    for (const s of scoreRows || [])
      holesByPlayer.set(s.round_player_id, (holesByPlayer.get(s.round_player_id) || 0) + 1);
  }

  const summaries = all.map((r) => {
    const players = r.players || [];
    const player = players.find((p) => p.user_id === userId) || players[0];
    const roundTee = one(r.tee);
    const playerTee = one(player?.player_tee);
    const tee = playerTee || roundTee;
    const course = one(r.course);
    const teePar = tee?.par || 72;
    let par = teePar;
    if (r.round_type !== "18" && player?.tee_id) {
      const split = nineHoleParByTee.get(player.tee_id);
      par = split ? (r.round_type === "9-back" ? split.back : split.front) : Math.round(teePar / 2);
    }
    const score = player?.final_gross_score ?? null;
    const holesPlayed = player?.id ? holesByPlayer.get(player.id) || 0 : 0;
    const isIncomplete = isRoundIncomplete(r.round_type, holesPlayed, score != null);

    return {
      id: r.id,
      round_date: r.round_date,
      round_type: r.round_type,
      format: r.format,
      status: r.status,
      course_name: course ? formatCourseName(course) : "Unknown",
      course_city: course?.city ?? null,
      course_state: course?.state ?? null,
      tee_name: tee?.tee_name || "",
      tee_color: tee?.tee_color ?? null,
      tee_gender: tee?.gender ?? null,
      par,
      final_score: score,
      score_to_par: isIncomplete ? null : score != null ? score - par : null,
      score_differential: player?.score_differential ?? null,
      is_incomplete: isIncomplete,
      holes_played: holesPlayed,
      expected_holes: expectedHoleCount(r.round_type),
    };
  });

  // Aggregates: full 18-hole individual rounds only (scrambles score low; a
  // 9-hole total isn't comparable; incomplete rounds carry a partial gross).
  const completed = summaries.filter(
    (r) => r.final_score != null && r.format !== "scramble" && !r.is_incomplete,
  );
  const eighteen = completed.filter((r) => r.round_type === "18");
  const avgScore = eighteen.length
    ? Math.round(eighteen.reduce((s, r) => s + (r.final_score || 0), 0) / eighteen.length)
    : null;
  const bestScore = eighteen.length ? Math.min(...eighteen.map((r) => r.final_score || 999)) : null;

  return NextResponse.json({
    handicapIndex,
    stats: { roundsCounted: completed.length, avgScore, bestScore },
    rounds: summaries,
  });
}

const ROUND_TYPES = ["18", "9-front", "9-back"];
const FORMATS = ["individual", "scramble"];

interface NewPlayer {
  user_id?: string | null;
  guest_name?: string | null;
  tee_id?: string | null;
  final_gross_score?: number | null;
}

/**
 * POST /api/v2/rounds — create a round (quick-entry: a typed gross per player, no
 * hole-by-hole yet). Personal & global; the creator is the authed golfer. For an
 * eligible loozer (18-hole individual with a gross) the score differential is
 * computed and their handicap recalculated. Hole-by-hole + live scoring land next.
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    course_id?: string;
    tee_id?: string;
    org_id?: string;
    round_date?: string;
    round_type?: string;
    format?: string;
    players?: NewPlayer[];
    silent?: boolean;
    games?: { game_type?: string; is_net?: boolean; value?: number | null; participants?: number[] }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { course_id, tee_id, org_id } = body;
  const round_type = ROUND_TYPES.includes(body.round_type || "") ? body.round_type! : "18";
  const format = FORMATS.includes(body.format || "") ? body.format! : "individual";
  const round_date = /^\d{4}-\d{2}-\d{2}$/.test(body.round_date || "")
    ? body.round_date!
    : new Date().toISOString().slice(0, 10);
  // A player with no identity defaults to the authed golfer (the "me" quick-entry
  // case). Then keep only valid rows (member XOR guest).
  const players = (body.players || [])
    .map((p) => (!p.user_id && !p.guest_name ? { ...p, user_id: userId } : p))
    .filter((p) => (p.user_id && !p.guest_name) || (!p.user_id && p.guest_name));

  if (!course_id || !tee_id) return NextResponse.json({ error: "course_id and tee_id are required" }, { status: 400 });
  if (players.length === 0) return NextResponse.json({ error: "At least one player is required" }, { status: 400 });

  const admin = v2AdminClient();

  // Ratings/pars for every tee used (players may sit on a different tee).
  const teeIds = [...new Set([tee_id, ...players.map((p) => p.tee_id || tee_id)])];
  const { data: teeRows } = await admin
    .from("v2_course_tees")
    .select("id, course_rating, slope_rating, par")
    .in("id", teeIds);
  const teeMap = new Map((teeRows || []).map((t) => [t.id, t]));
  if (!teeMap.has(tee_id)) return NextResponse.json({ error: "Tee not found" }, { status: 400 });

  const anyGross = players.some((p) => p.final_gross_score != null);
  const status = anyGross ? "completed" : "in_progress";
  // Silent = a quiet hole-by-hole back-fill of a past round: no "LIVE now"
  // broadcast (and, later, no teed-off/per-hole push). Completion still posts.
  const silent = body.silent === true;
  const nowIso = new Date().toISOString();

  const { data: round, error: roundErr } = await admin
    .from("v2_rounds")
    .insert({
      created_by: userId,
      course_id,
      tee_id,
      org_id: org_id ?? null,
      round_date,
      round_type,
      format,
      status,
      silent,
      completed_at: status === "completed" ? nowIso : null,
    })
    .select("id")
    .single();
  if (roundErr || !round) {
    return NextResponse.json({ error: roundErr?.message || "Could not create round" }, { status: 500 });
  }

  const is18 = round_type === "18";
  const isScramble = format === "scramble";

  const rows = players.map((p, i) => {
    const pTeeId = p.tee_id || tee_id;
    const tee = teeMap.get(pTeeId);
    const gross = p.final_gross_score ?? null;
    // Quick entry has no per-hole data, so adjusted = gross and a differential is
    // only computed for an eligible loozer (18-hole individual with a gross).
    const eligible = !!p.user_id && !isScramble && is18 && gross != null && !!tee?.course_rating && !!tee?.slope_rating;
    const differential = eligible
      ? calculateDifferential(gross!, tee!.course_rating!, tee!.slope_rating!)
      : null;
    return {
      round_id: round.id,
      user_id: p.user_id ?? null,
      guest_name: p.guest_name ?? null,
      tee_id: pTeeId,
      player_position: i + 1,
      final_gross_score: gross,
      final_adjusted_score: eligible ? gross : null,
      score_differential: differential,
    };
  });

  const { data: insertedPlayers, error: playersErr } = await admin
    .from("v2_round_players")
    .insert(rows)
    .select("id, player_position");
  if (playersErr) {
    await admin.from("v2_rounds").delete().eq("id", round.id); // roll back the orphan round
    return NextResponse.json({ error: playersErr.message }, { status: 500 });
  }

  // Side games (#183): participants come in as indexes into `rows`; map them to
  // the inserted round_player ids via player_position (i → i+1).
  if (Array.isArray(body.games) && body.games.length) {
    const idByPosition = new Map((insertedPlayers || []).map((p) => [p.player_position, p.id]));
    const gameRows = body.games
      .filter((g) => g && typeof g.game_type === "string" && Array.isArray(g.participants))
      .map((g) => ({
        round_id: round.id,
        game_type: g.game_type as string,
        is_net: !!g.is_net,
        config: typeof g.value === "number" && g.value > 0 ? { value: g.value } : {},
        participant_ids: (g.participants as number[])
          .map((i) => idByPosition.get(i + 1))
          .filter((x): x is string => !!x),
        created_by: userId,
      }))
      .filter((g) =>
        g.game_type === "nassau"
          ? g.participant_ids.length === 2
          : g.game_type === "sixes"
            ? g.participant_ids.length === 4
            : g.participant_ids.length >= 2,
      );
    if (gameRows.length) {
      const { error: gamesErr } = await admin.from("v2_round_games").insert(gameRows);
      if (gamesErr) console.error("v2_round_games insert failed:", gamesErr.message);
    }
  }

  // Recalculate the handicap of every loozer whose differential changed.
  if (!isScramble) {
    const affected = [...new Set(rows.filter((r) => r.score_differential != null && r.user_id).map((r) => r.user_id!))];
    await Promise.all(affected.map((uid) => recalculateHandicap(admin, uid)));
  }

  // Activity feed (best-effort): a LIVE entry while in progress, or per-Loozer
  // score entries when created already-completed (quick total). Keyed to the
  // round's group.
  if (org_id) {
    const [{ data: courseRow }, slug] = await Promise.all([
      admin.from("v2_courses").select("name, club_name").eq("id", course_id).maybeSingle(),
      orgSlug(admin, org_id),
    ]);
    if (slug) {
      const courseName = courseRow ? formatCourseName(courseRow) : "a round";
      const teePar = teeMap.get(tee_id)?.par ?? 72;
      const par = is18 ? teePar : Math.round(teePar / 2);
      if (status === "in_progress" && !silent) {
        // Player names for the live entry's subtitle ("Jeff, Bob, Guest").
        const loozerIds = players.map((p) => p.user_id).filter((u): u is string => !!u);
        const { data: profs } = loozerIds.length
          ? await admin.from("v2_profiles").select("id, display_name").in("id", loozerIds)
          : { data: [] as { id: string; display_name: string }[] };
        const nameById = new Map((profs || []).map((p) => [p.id, p.display_name]));
        const names = players.map((p) => (p.user_id ? nameById.get(p.user_id) || "Player" : p.guest_name || "Guest"));
        await logLiveRound(admin, { orgId: org_id, slug, roundId: round.id, creatorId: userId, courseName, subtitle: names.join(", ") });
      } else {
        const toPar = (g: number | null) => (g != null ? g - par : null);
        const entries = isScramble
          ? [{ actorId: userId, score: rows[0]?.final_gross_score ?? null, toPar: toPar(rows[0]?.final_gross_score ?? null) }]
          : rows.filter((r) => r.user_id).map((r) => ({ actorId: r.user_id!, score: r.final_gross_score, toPar: toPar(r.final_gross_score) }));
        await logRoundScores(admin, { orgId: org_id, slug, roundId: round.id, courseName, entries });
      }
    }
  }

  return NextResponse.json({ id: round.id });
}
