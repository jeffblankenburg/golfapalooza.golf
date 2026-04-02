import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStrokesOnHole, sortByDifficulty } from "@/lib/golf/stroke-distribution";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  // Fetch teams with members
  const { data: teams, error: teamsError } = await supabase
    .from("scramble_teams")
    .select(`
      id,
      team_handicap,
      gross_score,
      course_par,
      verified_at,
      members:scramble_team_members(
        user_id,
        user:users(display_name, avatar_url)
      )
    `)
    .eq("contest_id", contestId)
    .order("team_handicap", { ascending: false });

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  // Fetch hole scores for all teams
  const teamIds = (teams || []).map((t) => t.id);
  const { data: holeScores, error: scoresError } = await supabase
    .from("scramble_hole_scores")
    .select("team_id, hole_number, strokes")
    .in("team_id", teamIds.length > 0 ? teamIds : ["none"]);

  if (scoresError) {
    return NextResponse.json({ error: scoresError.message }, { status: 500 });
  }

  // Fetch hole info from contest tee assignments
  const { data: teeAssignments, error: teeError } = await supabase
    .from("contest_hole_tees")
    .select(`
      hole_number,
      tee:course_tees(
        tee_name,
        tee_color,
        holes:course_holes(hole_number, par, handicap_index, yards)
      )
    `)
    .eq("contest_id", contestId)
    .order("hole_number");

  if (teeError) {
    return NextResponse.json({ error: teeError.message }, { status: 500 });
  }

  // Build hole info from tee assignments
  const holes: { hole_number: number; par: number; handicap_index: number }[] = [];
  for (const ta of teeAssignments || []) {
    const tee = Array.isArray(ta.tee) ? ta.tee[0] : ta.tee;
    if (!tee) continue;
    const teeHoles = tee.holes || [];
    const holeData = teeHoles.find(
      (h: { hole_number: number }) => h.hole_number === ta.hole_number
    );
    if (holeData) {
      holes.push({
        hole_number: ta.hole_number,
        par: holeData.par,
        handicap_index: holeData.handicap_index,
      });
    }
  }

  // Fetch tee times for teams in this contest
  const { data: teeTimesData } = await supabase
    .from("tee_times")
    .select("scramble_team_id, tee_time, starting_hole")
    .in("scramble_team_id", teamIds.length > 0 ? teamIds : ["none"]);

  const teeTimeMap: Record<string, { tee_time: string; starting_hole: number | null }> = {};
  for (const tt of teeTimesData || []) {
    if (tt.scramble_team_id) {
      teeTimeMap[tt.scramble_team_id] = {
        tee_time: tt.tee_time,
        starting_hole: tt.starting_hole,
      };
    }
  }

  // Normalize teams
  const normalizedTeams = (teams || []).map((t) => ({
    id: t.id,
    team_handicap: t.team_handicap,
    gross_score: t.gross_score,
    course_par: t.course_par,
    verified_at: t.verified_at || null,
    tee_time: teeTimeMap[t.id]?.tee_time || null,
    starting_hole: teeTimeMap[t.id]?.starting_hole || null,
    members: (t.members || []).map((m: { user_id: string; user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] }) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        user_id: m.user_id,
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
      };
    }),
  }));

  // Fetch contest verification state
  const { data: contestState } = await supabase
    .from("contests")
    .select("verified_at")
    .eq("id", contestId)
    .single();

  // Compute tiebreaker ordering and notes from actual scores
  // Sort teams by net score, then break ties using handicap hole playoff
  interface RankedTeam { id: string; net: number; note?: string }
  const ranked: RankedTeam[] = [];
  const tiebreaker_notes: Record<string, string> = {}; // team_id -> note

  if (contestState?.verified_at && holes.length > 0) {
    const sortedHoles = sortByDifficulty(holes);

    // Build score lookup
    const scoreLookup: Record<string, Record<number, number>> = {};
    for (const s of holeScores || []) {
      if (!scoreLookup[s.team_id]) scoreLookup[s.team_id] = {};
      scoreLookup[s.team_id][s.hole_number] = s.strokes;
    }

    // Build net scores
    const teamNets: { id: string; net: number; handicap: number }[] = normalizedTeams
      .filter((t) => t.gross_score !== null)
      .map((t) => ({ id: t.id, net: t.gross_score! - t.team_handicap, handicap: t.team_handicap }));

    teamNets.sort((a, b) => a.net - b.net);

    // Group by net score
    let i = 0;
    while (i < teamNets.length) {
      const group = [teamNets[i]];
      while (i + 1 < teamNets.length && teamNets[i + 1].net === group[0].net) {
        group.push(teamNets[++i]);
      }
      i++;

      if (group.length === 1) {
        ranked.push({ id: group[0].id, net: group[0].net });
        continue;
      }

      // Tiebreak this group hole by hole
      let remaining = [...group];
      for (const hole of sortedHoles) {
        if (remaining.length <= 1) break;

        const netScores: { team: typeof remaining[0]; holeNet: number }[] = [];
        let allHaveScores = true;
        for (const team of remaining) {
          const gross = scoreLookup[team.id]?.[hole.hole_number];
          if (gross === undefined) { allHaveScores = false; break; }
          const strokes = getStrokesOnHole(team.handicap, hole.hole_number, sortedHoles);
          netScores.push({ team, holeNet: gross - strokes });
        }
        if (!allHaveScores) continue;

        // Sort by hole net score ascending
        netScores.sort((a, b) => a.holeNet - b.holeNet);

        // Check if this hole differentiates anyone
        const allSame = netScores.every((s) => s.holeNet === netScores[0].holeNet);
        if (allSame) continue; // All tied on this hole, try next

        const holePar = holes.find((h) => h.hole_number === hole.hole_number)?.par || 4;
        const formatNet = (net: number) => {
          if (net === holePar) return "net par";
          if (net === holePar - 1) return "net birdie";
          if (net === holePar - 2) return "net eagle";
          if (net < holePar) return `net ${holePar - net} under`;
          if (net === holePar + 1) return "net bogey";
          if (net === holePar + 2) return "net double bogey";
          return `net ${net - holePar} over`;
        };
        const allNets = netScores.map((s) => s.holeNet);
        const bestNet = netScores[0].holeNet;

        // Walk through sorted scores, grouping ties at each level
        let pos = 0;
        const nextRemaining: typeof remaining = [];
        while (pos < netScores.length) {
          // Find all teams tied at this score
          const tiedAtScore = [netScores[pos]];
          while (pos + 1 < netScores.length && netScores[pos + 1].holeNet === tiedAtScore[0].holeNet) {
            tiedAtScore.push(netScores[++pos]);
          }
          pos++;

          if (tiedAtScore.length === 1) {
            // Unique score — resolved
            const t = tiedAtScore[0];
            const others = allNets.filter((n) => n !== t.holeNet);
            if (t.holeNet === bestNet) {
              tiebreaker_notes[t.team.id] = `Won tiebreaker on Hole ${hole.hole_number} with ${formatNet(t.holeNet)} (${t.holeNet}) vs ${others.join(", ")}`;
            } else {
              tiebreaker_notes[t.team.id] = `Lost tiebreaker on Hole ${hole.hole_number} with ${formatNet(t.holeNet)} (${t.holeNet}) vs ${bestNet}`;
            }
            ranked.push({ id: t.team.id, net: t.team.net });
          } else {
            // Still tied — need further tiebreaking on next hole
            for (const t of tiedAtScore) {
              nextRemaining.push(t.team);
            }
          }
        }
        remaining = nextRemaining;
      }

      // Any remaining unbroken ties get added in original order
      for (const r of remaining) {
        ranked.push({ id: r.id, net: r.net });
      }
    }

    // Add teams without scores at the end
    for (const t of normalizedTeams) {
      if (!ranked.some((r) => r.id === t.id)) {
        ranked.push({ id: t.id, net: Infinity });
      }
    }
  }

  return NextResponse.json({
    teams: normalizedTeams,
    holeScores: holeScores || [],
    holes: holes.sort((a, b) => a.hole_number - b.hole_number),
    contest_verified: !!contestState?.verified_at,
    tiebreaker_notes,
    // Correct ordering with tiebreakers applied (team IDs in order)
    ranked_order: ranked.map((r) => r.id),
  });
}
