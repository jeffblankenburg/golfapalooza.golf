import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateDifferential, calculateAdjustedGrossScore, calculateCourseHandicap } from "@/lib/golf/calculator";
import { recalculateHandicap } from "@/lib/golf/handicap";
import { getEffectiveUserId } from "@/lib/simulator";
import { notifyPlayersAddedToRound } from "@/lib/rounds/notify";

// GET - List user's rounds
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(user.id);

  const { data: rounds, error } = await supabase
    .from("rounds")
    .select(`
      id,
      round_date,
      round_type,
      status,
      notes,
      created_at,
      course:courses(id, name, city, state),
      tee:course_tees(id, tee_name, tee_color, course_rating, slope_rating, par),
      round_players!inner(
        id,
        user_id,
        tee_id,
        final_gross_score,
        final_adjusted_score,
        score_differential,
        player_tee:course_tees(id, tee_name, tee_color, course_rating, slope_rating, par)
      )
    `)
    .eq("round_players.user_id", userId)
    .order("round_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // For 9-hole rounds we need the par of only the played holes, not the
  // tee's 18-hole par. Batch fetch hole pars for every distinct tee that
  // backs a non-18 round so we sum the right nine.
  const nineHoleTeeIds = new Set<string>();
  for (const r of rounds || []) {
    if (r.round_type === "18") continue;
    const allPlayers = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = allPlayers.find((p) => p.user_id === userId) || allPlayers[0];
    if (player?.tee_id) nineHoleTeeIds.add(player.tee_id);
  }

  const nineHoleParByTee = new Map<string, { front: number; back: number }>();
  if (nineHoleTeeIds.size > 0) {
    const { data: holes } = await supabase
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

  const summaries = (rounds || []).map((r) => {
    const allPlayers = Array.isArray(r.round_players) ? r.round_players : [r.round_players];
    const player = allPlayers.find((p) => p.user_id === userId) || allPlayers[0];
    const roundTee = Array.isArray(r.tee) ? r.tee[0] : r.tee;
    // Prefer the player's personal tee (may be a composition tee override)
    const playerTee = player?.player_tee ? (Array.isArray(player.player_tee) ? player.player_tee[0] : player.player_tee) : null;
    const tee = playerTee || roundTee;
    const course = Array.isArray(r.course) ? r.course[0] : r.course;
    const teePar = tee?.par || 72;
    const score = player?.final_gross_score;

    let par = teePar;
    if (r.round_type !== "18" && player?.tee_id) {
      const split = nineHoleParByTee.get(player.tee_id);
      if (split) {
        par = r.round_type === "9-back" ? split.back : split.front;
      } else {
        // Fallback: halve the 18-hole par when per-hole data is missing.
        par = Math.round(teePar / 2);
      }
    }

    return {
      id: r.id,
      round_date: r.round_date,
      round_type: r.round_type,
      status: r.status,
      course_name: course?.name || "Unknown",
      course_city: course?.city,
      course_state: course?.state,
      tee_name: tee?.tee_name || "",
      tee_color: tee?.tee_color,
      par,
      final_score: score,
      score_to_par: score != null ? score - par : null,
      score_differential: player?.score_differential,
    };
  });

  return NextResponse.json({ rounds: summaries });
}

// POST - Create a round with players and optional hole scores in one call
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(user.id);

  try {
    const body = await request.json();
    const { course_id, tee_id, round_type, round_date, players, hole_scores } = body;
    // players: array of { key?, user_id?, guest_name?, tee_id?, final_gross_score? }
    //   - exactly one of user_id / guest_name per player (guests are non-app players)
    //   - key: client identifier used to look up this player's hole_scores; defaults
    //     to user_id, so guests MUST supply a key
    // hole_scores: optional Record<key, Record<hole_number, strokes>> for full scorecard

    if (!course_id || !tee_id) {
      return NextResponse.json({ error: "course_id and tee_id are required" }, { status: 400 });
    }

    type IncomingPlayer = {
      key?: string;
      user_id?: string | null;
      guest_name?: string | null;
      tee_id?: string;
      final_gross_score?: number | null;
    };
    const allPlayers: IncomingPlayer[] =
      players && players.length > 0 ? players : [{ user_id: userId }];

    // The stable identifier the client used to key hole_scores for this player.
    const playerKey = (p: IncomingPlayer): string => p.key ?? p.user_id ?? "";

    const hasHoleScores = hole_scores && Object.keys(hole_scores).length > 0;
    const effectiveRoundType = round_type || "18";

    // If we have hole scores, compute gross totals from them
    if (hasHoleScores) {
      for (const p of allPlayers) {
        const playerHoles = hole_scores[playerKey(p)];
        if (playerHoles) {
          p.final_gross_score = Object.values(playerHoles).reduce((sum: number, s: unknown) => sum + (s as number), 0);
        }
      }
    }

    const isComplete = allPlayers.every((p) => p.final_gross_score != null);

    // Handicap differentials are only valid for complete 18-hole rounds.
    // Quick Entry (no hole_scores) trusts the user's final_gross_score as a
    // full-round total. Hole-by-hole entry requires all 18 holes scored.
    function qualifiesForHandicap(key: string): boolean {
      if (effectiveRoundType !== "18") return false;
      if (!hasHoleScores) return true;
      const playerHoles = hole_scores[key];
      return !!playerHoles && Object.keys(playerHoles).length >= 18;
    }

    // Get all tee data needed for differential calc (round tee + any player overrides)
    const allTeeIds = [...new Set([tee_id, ...allPlayers.map((p) => p.tee_id).filter(Boolean)])];
    const { data: teesData } = await supabase
      .from("course_tees")
      .select("id, course_rating, slope_rating, par")
      .in("id", allTeeIds);
    const teeMap = new Map((teesData || []).map((t) => [t.id, t]));

    // 1. Create round
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .insert({
        created_by: userId,
        course_id,
        tee_id,
        round_type: round_type || "18",
        round_date: round_date || new Date().toISOString().split("T")[0],
        status: isComplete ? "completed" : "in_progress",
        completed_at: isComplete ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (roundError) {
      return NextResponse.json({ error: roundError.message }, { status: 500 });
    }

    // 2. Batch insert all round_players (each player may have their own tee)
    // Map player_position -> client key so we can re-key hole_scores after
    // insert (the inserted rows carry user_id=NULL for guests, so we can't
    // look them up by user_id; position is assigned i+1 below).
    const keyByPosition = new Map<number, string>();
    allPlayers.forEach((p, i) => keyByPosition.set(i + 1, playerKey(p)));

    const playerRows = allPlayers.map((p, i) => {
      const playerTeeId = p.tee_id || tee_id;
      const playerTee = teeMap.get(playerTeeId);
      const isGuest = !p.user_id;
      let scoreDifferential: number | null = null;
      // Guests have no handicap and never get a differential.
      if (
        !isGuest &&
        qualifiesForHandicap(playerKey(p)) &&
        p.final_gross_score != null &&
        playerTee?.course_rating &&
        playerTee?.slope_rating
      ) {
        scoreDifferential = calculateDifferential(p.final_gross_score, playerTee.course_rating, playerTee.slope_rating);
      }
      return {
        round_id: round.id,
        user_id: p.user_id ?? null,
        guest_name: isGuest ? (p.guest_name ?? "Guest") : null,
        tee_id: playerTeeId,
        player_position: i + 1,
        is_scorer: p.user_id === userId,
        final_gross_score: p.final_gross_score ?? null,
        score_differential: scoreDifferential,
      };
    });

    const { data: roundPlayers, error: rpError } = await supabase
      .from("round_players")
      .insert(playerRows)
      .select();

    if (rpError) {
      return NextResponse.json({ error: rpError.message }, { status: 500 });
    }

    // 3. Batch insert all hole scores (if provided)
    if (hasHoleScores && roundPlayers) {
      const scoreRows: {
        round_id: string;
        round_player_id: string;
        hole_number: number;
        strokes: number;
        penalty_strokes: number;
      }[] = [];

      for (const rp of roundPlayers) {
        const key = keyByPosition.get(rp.player_position);
        const playerHoles = key ? hole_scores[key] : undefined;
        if (!playerHoles) continue;

        for (const [holeStr, strokes] of Object.entries(playerHoles)) {
          scoreRows.push({
            round_id: round.id,
            round_player_id: rp.id,
            hole_number: parseInt(holeStr),
            strokes: strokes as number,
            penalty_strokes: 0,
          });
        }
      }

      if (scoreRows.length > 0) {
        const { error: scoresError } = await supabase
          .from("round_scores")
          .insert(scoreRows);

        if (scoresError) {
          return NextResponse.json({ error: scoresError.message }, { status: 500 });
        }
      }
    }

    // If completed, calculate adjusted scores (when hole data exists) and recalculate handicaps
    if (isComplete && roundPlayers) {
      const playerUserIds = new Set<string>();

      if (hasHoleScores) {
        // Fetch course holes for adjusted gross score calculation
        const { data: courseHoles } = await supabase
          .from("course_holes")
          .select("hole_number, par, handicap_index, tee_id")
          .in("tee_id", allTeeIds);

        if (courseHoles && courseHoles.length > 0) {
          const holesByTee = new Map<string, { hole_number: number; par: number; handicap_index: number }[]>();
          for (const h of courseHoles) {
            const arr = holesByTee.get(h.tee_id) || [];
            arr.push({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index });
            holesByTee.set(h.tee_id, arr);
          }

          for (const rp of roundPlayers) {
            // Guests get gross totals only — no adjusted score, no differential.
            if (!rp.user_id) continue;
            if (rp.final_gross_score == null) continue;
            const key = keyByPosition.get(rp.player_position);
            const playerTeeId = allPlayers[rp.player_position - 1]?.tee_id || tee_id;
            const tee = teeMap.get(playerTeeId);
            const holes = holesByTee.get(playerTeeId);
            const playerHoles = key ? hole_scores[key] : undefined;
            if (!tee || !holes || !playerHoles) continue;

            // Get player's current handicap for NDB calculation
            const { data: playerHcp } = await supabase
              .from("player_handicaps")
              .select("handicap_index")
              .eq("user_id", rp.user_id)
              .maybeSingle();
            const hi = playerHcp?.handicap_index ?? 0;
            const courseHandicap = calculateCourseHandicap(hi, tee.slope_rating, tee.course_rating, tee.par);

            const holeMap = new Map(holes.map((h) => [h.hole_number, h]));
            const holeScoreData = Object.entries(playerHoles)
              .filter(([hNum]) => holeMap.has(parseInt(hNum)))
              .map(([hNum, strokes]) => ({
                strokes: strokes as number,
                par: holeMap.get(parseInt(hNum))!.par,
                handicap_index: holeMap.get(parseInt(hNum))!.handicap_index,
              }));

            if (holeScoreData.length > 0) {
              const adjustedGross = calculateAdjustedGrossScore(holeScoreData, courseHandicap);
              const eligible = qualifiesForHandicap(key ?? "");
              const differential = eligible
                ? calculateDifferential(adjustedGross, tee.course_rating, tee.slope_rating)
                : null;
              await supabase
                .from("round_players")
                .update({
                  final_adjusted_score: adjustedGross,
                  ...(eligible ? { score_differential: differential } : {}),
                })
                .eq("id", rp.id);
            }

            playerUserIds.add(rp.user_id);
          }
        }
      }

      // If no hole scores (Quick Entry), still recalculate handicaps
      if (!hasHoleScores) {
        for (const rp of roundPlayers) {
          if (rp.user_id) playerUserIds.add(rp.user_id);
        }
      }

      // Recalculate handicap for all players
      await Promise.all(
        [...playerUserIds].map((uid) => recalculateHandicap(supabase, uid))
      );
    }

    // Issue #131 — push the freshly-added players (except the actor) that
    // they're on the roster. Best-effort; helper swallows errors so a flaky
    // notification service never blocks round creation.
    if (roundPlayers && roundPlayers.length > 0) {
      await notifyPlayersAddedToRound({
        roundId: round.id,
        // Guests (user_id NULL) have no account to notify.
        playerUserIds: roundPlayers
          .map((rp) => rp.user_id)
          .filter((id): id is string => !!id),
        actorUserId: userId,
      });
    }

    return NextResponse.json({ round, round_players: roundPlayers });
  } catch {
    return NextResponse.json({ error: "Failed to create round" }, { status: 500 });
  }
}
