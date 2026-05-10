/**
 * Issue #128 — KGB Cup structural generator.
 *
 * Sets up the team/pair/foursome scaffolding so the KGB Cup admin views
 * + leaderboard renders against real data. **Skips deep hole-by-hole
 * scoring** — that's its own Phase 3 follow-up. Admin can use the
 * existing live-scoring admin tools to populate scores once the
 * structure is in place.
 *
 * What gets created:
 *   - 2 ryder_cup_teams (USA / EUR)
 *   - rostered Loozers split 50/50 across teams
 *   - ryder_cup_pairs within each team (2-player pairs)
 *   - ryder_cup_foursomes pairing each team-1 pair against a team-2 pair
 *   - kgb_cup_player_handicaps for every Loozer (adjusted = original)
 *
 * Idempotent — wipes existing structure first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTestEventContests, shuffle, chunk } from "../shared";
import type { GeneratorResult } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export async function generateKgbCup(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const contests = await listTestEventContests(client, testTripId);
  const kgb = contests.find((c) => c.contest_type === "ryder_cup");

  if (!kgb) {
    return {
      module: "kgb_cup",
      inserted: 0,
      skipped: 0,
      warnings: ["No KGB Cup contest configured in the test event — skipping."],
    };
  }

  const { data: roster } = await client
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", testTripId)
    .eq("on_roster", true);
  const userIds = (roster || []).map((r) => r.user_id as string);
  if (userIds.length < 4) {
    return {
      module: "kgb_cup",
      inserted: 0,
      skipped: 1,
      warnings: ["Need at least 4 rostered Loozers for KGB Cup."],
    };
  }

  // Look up handicap indices.
  const { data: hcps } = await client
    .from("player_handicaps")
    .select("user_id, handicap_index")
    .in("user_id", userIds);
  const hcpMap = new Map<string, number>();
  for (const h of hcps || []) {
    hcpMap.set(h.user_id as string, Number(h.handicap_index) || 18);
  }

  // ── Wipe existing structure for this contest ───────────────────
  // Get existing teams + pairs to cascade-delete child rows manually
  // where ON DELETE CASCADE doesn't already cover them.
  const { data: existingTeams } = await client
    .from("ryder_cup_teams")
    .select("id")
    .eq("contest_id", kgb.id);
  const oldTeamIds = (existingTeams || []).map((t) => t.id as string);

  await client.from("ryder_cup_foursomes").delete().eq("contest_id", kgb.id);
  await client.from("kgb_cup_hole_scores").delete().eq("foursome_id", "00000000-0000-0000-0000-000000000000"); // no-op pre-clean (keeps query path warm)
  await client.from("kgb_cup_player_handicaps").delete().eq("contest_id", kgb.id);
  if (oldTeamIds.length > 0) {
    // pairs cascade from team delete; safe to skip explicit pairs delete.
    await client.from("ryder_cup_teams").delete().in("id", oldTeamIds);
  }

  // ── Teams ──────────────────────────────────────────────────────
  let inserted = 0;
  const { data: team1, error: t1Err } = await client
    .from("ryder_cup_teams")
    .insert({ contest_id: kgb.id, team_number: 1, team_name: "USA" })
    .select("id")
    .single();
  const { data: team2, error: t2Err } = await client
    .from("ryder_cup_teams")
    .insert({ contest_id: kgb.id, team_number: 2, team_name: "EUR" })
    .select("id")
    .single();
  if (t1Err || t2Err || !team1 || !team2) {
    return {
      module: "kgb_cup",
      inserted: 0,
      skipped: 1,
      warnings: [`teams: ${t1Err?.message || t2Err?.message}`],
    };
  }
  inserted += 2;

  // ── Split roster into 2 teams, then chunk each team into pairs ──
  const shuffled = shuffle([...userIds]);
  const half = Math.floor(shuffled.length / 2);
  const team1Users = shuffled.slice(0, half);
  const team2Users = shuffled.slice(half, half * 2); // drop odd extras for even pairing

  const team1Pairs = chunk(team1Users, 2);
  const team2Pairs = chunk(team2Users, 2);

  async function insertPairs(teamId: string, pairs: string[][]): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i];
      const { data, error } = await client
        .from("ryder_cup_pairs")
        .insert({
          team_id: teamId,
          player_a_id: a || null,
          player_b_id: b || null,
          sort_order: i,
        })
        .select("id")
        .single();
      if (error || !data) {
        warnings.push(`ryder_cup_pairs: ${error?.message}`);
        continue;
      }
      ids.push(data.id as string);
      inserted += 1;
    }
    return ids;
  }

  const team1PairIds = await insertPairs(team1.id as string, team1Pairs);
  const team2PairIds = await insertPairs(team2.id as string, team2Pairs);

  // ── Foursomes: pair-i (team1) vs pair-i (team2) ────────────────
  const minLen = Math.min(team1PairIds.length, team2PairIds.length);
  for (let i = 0; i < minLen; i++) {
    const { error } = await client.from("ryder_cup_foursomes").insert({
      contest_id: kgb.id,
      pair_team1_id: team1PairIds[i],
      pair_team2_id: team2PairIds[i],
      sort_order: i,
    });
    if (error) warnings.push(`ryder_cup_foursomes: ${error.message}`);
    else inserted += 1;
  }

  // ── kgb_cup_player_handicaps ──────────────────────────────────
  const hcpRows = userIds.map((id) => ({
    contest_id: kgb.id,
    player_id: id,
    original_handicap: hcpMap.get(id) ?? 18,
    adjusted_handicap: Math.round(hcpMap.get(id) ?? 18),
  }));
  const { error: hcpErr } = await client
    .from("kgb_cup_player_handicaps")
    .insert(hcpRows);
  if (hcpErr) warnings.push(`kgb_cup_player_handicaps: ${hcpErr.message}`);
  else inserted += hcpRows.length;

  warnings.push(
    "KGB Cup hole-by-hole scoring not auto-generated — use the admin live-scoring tools to populate scores, or wait for sim Phase 3.",
  );

  return { module: "kgb_cup", inserted, skipped: 0, warnings };
}
