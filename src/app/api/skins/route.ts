import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calcSkins, distributeSkinsPot } from "@/lib/skins";

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

  // Skins is funded by the bundled Trip Cost option. The accurate
  // "paying" count is the number of Loozers who've checked Trip Cost
  // in their selections — not the roster, since the option form is
  // how people commit to the bundle.
  let participantCount = 0;
  if (contest?.trip_id) {
    const { data: tripCostOpt } = await supabase
      .from("trip_options")
      .select("id")
      .eq("trip_id", contest.trip_id)
      .eq("option_type", "trip_cost")
      .maybeSingle();
    if (tripCostOpt?.id) {
      const { data: sels } = await supabase
        .from("user_option_selections")
        .select("value")
        .eq("option_id", tripCostOpt.id);
      participantCount = (sels || []).filter((s) => s.value === true).length;
    }
  }

  // Per-player Skins amount comes from the Skins child contest's buy-in
  // cost item. The Skins contest hangs off the Scramble Day contest via
  // parent_contest_id (issue #124 Phase B). Defaults to $10 if nothing
  // is configured.
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
    return NextResponse.json({
      complete: false,
      message: "Teams not yet assigned",
      participantCount,
      perPlayerAmount,
    });
  }

  // Check if all teams have complete scores
  const allComplete = teams.every((t) => t.gross_score !== null);
  if (!allComplete) {
    return NextResponse.json({
      complete: false,
      message: "Scores still being entered",
      participantCount,
      perPlayerAmount,
    });
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

  // Distribute the day's pot using the whole-dollar algorithm. Returns
  // per-team totals + per-player amounts (sum exactly = pool).
  const pot = participantCount * perPlayerAmount;
  const distInput = teams
    .filter((t) => (result.skinCounts.get(t.id) ?? 0) > 0)
    .map((t) => ({
      id: t.id,
      skins: result.skinCounts.get(t.id) ?? 0,
      member_user_ids: (t.members || []).map(
        (m: { user_id: string }) => m.user_id,
      ),
    }));
  const payouts = distributeSkinsPot(pot, distInput);
  const payoutByTeam = new Map(payouts.map((p) => [p.team_id, p]));

  // Normalize team data for response
  const teamData = teams.map((t) => {
    const skins = result.skinCounts.get(t.id) || 0;
    const payout = payoutByTeam.get(t.id);
    const members = (t.members || []).map((m: { user_id: string; user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] }) => {
      const u = Array.isArray(m.user) ? m.user[0] : m.user;
      return {
        user_id: m.user_id,
        display_name: u?.display_name || "Unknown",
        avatar_url: u?.avatar_url || null,
        amount: payout?.per_player.get(m.user_id) ?? 0,
      };
    });

    return {
      id: t.id,
      team_handicap: t.team_handicap,
      members,
      skins,
      team_total: payout?.team_total ?? 0,
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
