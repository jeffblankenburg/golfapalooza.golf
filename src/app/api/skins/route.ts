import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcSkins } from "@/lib/skins";

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

  // Fetch contest to get trip_id
  const { data: contest } = await supabase
    .from("contests")
    .select("trip_id")
    .eq("id", contestId)
    .single();

  // Count event participants for the pot calculation
  let participantCount = 0;
  if (contest?.trip_id) {
    const { count } = await supabase
      .from("event_participants")
      .select("*", { count: "exact", head: true })
      .eq("trip_id", contest.trip_id);
    participantCount = count || 0;
  }

  // Per-player Skins amount comes from the Skins child contest's buy-in
  // cost item. The Skins contest hangs off the Scramble Day contest via
  // parent_contest_id (issue #124 Phase B). Falls back to the legacy
  // payout_sheet_events lookup for trips that haven't been migrated, then
  // to $10 as a last resort.
  let perPlayerAmount = 10;
  const { data: skinsContest } = await supabase
    .from("contests")
    .select("buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost)")
    .eq("parent_contest_id", contestId)
    .eq("contest_type", "scramble_skins")
    .maybeSingle();
  type CostJoin = { cost: number | string } | Array<{ cost: number | string }> | null | undefined;
  const skinsCostJoin = (skinsContest as { buy_in_cost_item?: CostJoin } | null)?.buy_in_cost_item;
  const skinsItem = Array.isArray(skinsCostJoin) ? skinsCostJoin[0] : skinsCostJoin;
  const skinsCost = skinsItem && skinsItem.cost != null ? Number(skinsItem.cost) : null;
  if (skinsCost !== null && skinsCost > 0) {
    perPlayerAmount = skinsCost;
  } else {
    // Legacy fallback for un-migrated trips.
    const { data: skinsEvent } = await supabase
      .from("payout_sheet_events")
      .select("amount_per_participant, cost_item:cost_items(cost)")
      .eq("participant_source", "scramble")
      .eq("source_ref", contestId)
      .ilike("label", "%skins%")
      .maybeSingle();
    if (skinsEvent) {
      const joined = (skinsEvent as { cost_item?: CostJoin }).cost_item;
      const item = Array.isArray(joined) ? joined[0] : joined;
      const linkedCost = item && item.cost != null ? Number(item.cost) : null;
      const stored = Number(skinsEvent.amount_per_participant);
      if (linkedCost !== null && linkedCost > 0) {
        perPlayerAmount = linkedCost;
      } else if (stored > 0) {
        perPlayerAmount = stored;
      }
    }
  }

  // Fetch teams
  const { data: teams, error: teamsError } = await supabase
    .from("scramble_teams")
    .select(`
      id,
      team_handicap,
      gross_score,
      course_par,
      members:scramble_team_members(
        user_id,
        user:users(display_name, avatar_url)
      )
    `)
    .eq("contest_id", contestId);

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  if (!teams || teams.length === 0) {
    return NextResponse.json({ complete: false, message: "No teams found" });
  }

  // Check if all teams have complete scores
  const allComplete = teams.every((t) => t.gross_score !== null);
  if (!allComplete) {
    return NextResponse.json({ complete: false, message: "Scores still being entered" });
  }

  // Fetch hole scores
  const teamIds = teams.map((t) => t.id);
  const { data: holeScoresRaw, error: scoresError } = await supabase
    .from("scramble_hole_scores")
    .select("team_id, hole_number, strokes")
    .in("team_id", teamIds);

  if (scoresError) {
    return NextResponse.json({ error: scoresError.message }, { status: 500 });
  }

  // Fetch hole info from tee assignments
  const { data: teeAssignments, error: teeError } = await supabase
    .from("contest_hole_tees")
    .select(`
      hole_number,
      handicap_index_override,
      tee:course_tees(
        holes:course_holes(hole_number, par, handicap_index)
      )
    `)
    .eq("contest_id", contestId);

  if (teeError) {
    return NextResponse.json({ error: teeError.message }, { status: 500 });
  }

  // All-or-nothing: overrides only apply when every one of the 18 holes has one.
  const overridesActive =
    (teeAssignments?.length || 0) === 18 &&
    (teeAssignments || []).every(
      (ta) =>
        typeof (ta as { handicap_index_override?: number | null })
          .handicap_index_override === "number"
    );

  // Build holes array
  const holes: { hole_number: number; handicap_index: number }[] = [];
  const holePars: Record<number, number> = {};
  for (const ta of teeAssignments || []) {
    const tee = Array.isArray(ta.tee) ? ta.tee[0] : ta.tee;
    if (!tee) continue;
    const teeHoles = tee.holes || [];
    const holeData = teeHoles.find(
      (h: { hole_number: number }) => h.hole_number === ta.hole_number
    );
    if (holeData) {
      const overrideValue = (
        ta as { handicap_index_override?: number | null }
      ).handicap_index_override;
      holes.push({
        hole_number: ta.hole_number,
        handicap_index:
          overridesActive && typeof overrideValue === "number"
            ? overrideValue
            : holeData.handicap_index,
      });
      holePars[ta.hole_number] = holeData.par;
    }
  }

  // Build holeScores map
  const holeScores: Record<string, Record<number, number>> = {};
  for (const s of holeScoresRaw || []) {
    if (!holeScores[s.team_id]) holeScores[s.team_id] = {};
    holeScores[s.team_id][s.hole_number] = s.strokes;
  }

  // Calculate skins
  const skinTeams = teams.map((t) => ({ id: t.id, team_handicap: t.team_handicap }));
  const result = calcSkins(skinTeams, holes, holeScores);

  // Normalize team data for response
  const teamData = teams.map((t) => {
    const members = (t.members || []).map((m: { user_id: string; user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] }) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
      };
    });

    return {
      id: t.id,
      team_handicap: t.team_handicap,
      members,
      skins: result.skinCounts.get(t.id) || 0,
      winningHoles: Array.from(result.skinWins.get(t.id) || [])
        .sort((a, b) => a - b)
        .map((h) => ({ hole: h, score: holeScores[t.id]?.[h] ?? null, par: holePars[h] ?? null })),
    };
  });

  // Sort by skins descending
  teamData.sort((a, b) => b.skins - a.skins);

  return NextResponse.json({
    complete: true,
    totalSkins: result.totalSkins,
    participantCount,
    perPlayerAmount,
    teams: teamData,
  });
}
