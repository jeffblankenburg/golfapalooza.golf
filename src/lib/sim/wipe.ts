/**
 * Issue #128 — scoped data wipe for the test event.
 *
 * Clears the *data layer* (scores, winners, participants, picks, bids,
 * brackets) while keeping the *structural layer* (contests, options,
 * cost_items) intact — admin doesn't have to reconfigure the test event
 * each run.
 *
 * Every delete is scoped to either `trip_id = testTripId` (for trip-
 * scoped tables) or `contest_id IN (test trip's contests)` (for
 * contest-scoped tables). Real-event rows are physically unreachable
 * because they sit under a different trip_id / contest_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleName, WipeResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

interface DeleteCount {
  table: string;
  deleted: number;
}

async function deleteByTripId(
  client: Client,
  table: string,
  testTripId: string,
): Promise<DeleteCount> {
  const { error, count } = await client
    .from(table)
    .delete({ count: "exact" })
    .eq("trip_id", testTripId);
  if (error) throw new Error(`wipe ${table}: ${error.message}`);
  return { table, deleted: count ?? 0 };
}

async function deleteByContestId(
  client: Client,
  table: string,
  contestIds: string[],
): Promise<DeleteCount> {
  if (contestIds.length === 0) return { table, deleted: 0 };
  const { error, count } = await client
    .from(table)
    .delete({ count: "exact" })
    .in("contest_id", contestIds);
  if (error) throw new Error(`wipe ${table}: ${error.message}`);
  return { table, deleted: count ?? 0 };
}

async function deleteByTeamId(
  client: Client,
  table: string,
  teamIds: string[],
): Promise<DeleteCount> {
  if (teamIds.length === 0) return { table, deleted: 0 };
  const { error, count } = await client
    .from(table)
    .delete({ count: "exact" })
    .in("team_id", teamIds);
  if (error) throw new Error(`wipe ${table}: ${error.message}`);
  return { table, deleted: count ?? 0 };
}

async function getContestIds(client: Client, testTripId: string): Promise<string[]> {
  const { data } = await client
    .from("contests")
    .select("id")
    .eq("trip_id", testTripId);
  return (data || []).map((r) => r.id as string);
}

async function getScrambleTeamIds(client: Client, contestIds: string[]): Promise<string[]> {
  if (contestIds.length === 0) return [];
  const { data } = await client
    .from("scramble_teams")
    .select("id")
    .in("contest_id", contestIds);
  return (data || []).map((r) => r.id as string);
}

async function wipeRoster(
  client: Client,
  testTripId: string,
  contestIds: string[],
): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  // contest_participants tied to test contests
  const cp = await deleteByContestId(client, "contest_participants", contestIds);
  deleted[cp.table] = cp.deleted;
  // event_participants for the test trip
  const ep = await deleteByTripId(client, "event_participants", testTripId);
  deleted[ep.table] = ep.deleted;
  return { module: "roster", deleted };
}

async function wipeScramble(
  client: Client,
  contestIds: string[],
): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  // Find team ids to delete child rows cleanly.
  const teamIds = await getScrambleTeamIds(client, contestIds);

  // Hole scores + bonus points (child of teams)
  const hs = await deleteByTeamId(client, "scramble_hole_scores", teamIds);
  deleted[hs.table] = hs.deleted;
  // scramble_bonus_points is optional — table may not be present everywhere
  try {
    const bp = await deleteByTeamId(client, "scramble_bonus_points", teamIds);
    deleted[bp.table] = bp.deleted;
  } catch {
    // ignore if the table doesn't exist
  }
  // Members
  const mem = await deleteByTeamId(client, "scramble_team_members", teamIds);
  deleted[mem.table] = mem.deleted;
  // Teams themselves
  const teams = await deleteByContestId(client, "scramble_teams", contestIds);
  deleted[teams.table] = teams.deleted;
  // contest_winners for those contests (scramble + skins materialized rows)
  const winners = await deleteByContestId(client, "contest_winners", contestIds);
  deleted[winners.table] = winners.deleted;

  return { module: "scramble", deleted };
}

async function wipeDailyContests(
  client: Client,
  contestIds: string[],
): Promise<WipeResult> {
  // Daily contest winners now live on contest_winners. Wipe them for any
  // ctp_/long_drive/long_putt contest under the test trip.
  const { data: dailyContests } = await client
    .from("contests")
    .select("id, contest_type")
    .in("id", contestIds);
  const dailyIds = (dailyContests || [])
    .filter((c) =>
      ["ctp_front", "ctp_back", "long_drive", "long_putt"].includes(c.contest_type as string),
    )
    .map((c) => c.id as string);
  const w = await deleteByContestId(client, "contest_winners", dailyIds);
  return { module: "daily_contests", deleted: { [w.table]: w.deleted } };
}

async function wipeHundredFeet(
  client: Client,
  testTripId: string,
): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  const hf = await deleteByTripId(client, "hundred_feet_scores", testTripId);
  deleted[hf.table] = hf.deleted;
  return { module: "hundred_feet", deleted };
}

async function wipePickem(client: Client, contestIds: string[]): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  // pickem_picks links via pickem_games.contest_id
  if (contestIds.length > 0) {
    const { data: games } = await client
      .from("pickem_games")
      .select("id")
      .in("contest_id", contestIds);
    const gameIds = (games || []).map((g) => g.id as string);
    if (gameIds.length > 0) {
      const { error, count } = await client
        .from("pickem_picks")
        .delete({ count: "exact" })
        .in("game_id", gameIds);
      if (error) throw new Error(`wipe pickem_picks: ${error.message}`);
      deleted["pickem_picks"] = count ?? 0;
    }
  }
  return { module: "pickem", deleted };
}

async function wipeCalcutta(client: Client, contestIds: string[]): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  if (contestIds.length === 0) return { module: "calcutta", deleted };
  // calcutta_bids tied to test contests (only the calcutta one(s))
  const { error, count } = await client
    .from("calcutta_bids")
    .delete({ count: "exact" })
    .in("contest_id", contestIds);
  if (!error) deleted["calcutta_bids"] = count ?? 0;
  return { module: "calcutta", deleted };
}

async function wipeCornhole(client: Client, contestIds: string[]): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  if (contestIds.length === 0) return { module: "cornhole", deleted };
  // Bracket matches + scores live under cornhole contests
  const ch = await deleteByContestId(client, "cornhole_bracket_matches", contestIds);
  deleted[ch.table] = ch.deleted;
  try {
    const cs = await deleteByContestId(client, "cornhole_scores", contestIds);
    deleted[cs.table] = cs.deleted;
  } catch {
    // optional
  }
  return { module: "cornhole", deleted };
}

async function wipeKgbCup(client: Client, contestIds: string[]): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  if (contestIds.length === 0) return { module: "kgb_cup", deleted };
  for (const table of [
    "kgb_cup_hole_scores",
    "kgb_cup_player_handicaps",
    "kgb_cup_pair_handicaps",
    "kgb_cup_foursomes",
    "kgb_cup_pairs",
  ]) {
    try {
      const r = await deleteByContestId(client, table, contestIds);
      deleted[r.table] = r.deleted;
    } catch {
      // tables may not exist on every install
    }
  }
  return { module: "kgb_cup", deleted };
}

async function wipeTeeTimes(client: Client, testTripId: string): Promise<WipeResult> {
  const deleted: Record<string, number> = {};
  // tee_time_players → tee_times for this trip
  const { data: teeTimes } = await client
    .from("tee_times")
    .select("id")
    .eq("trip_id", testTripId);
  const teeTimeIds = (teeTimes || []).map((t) => t.id as string);
  if (teeTimeIds.length > 0) {
    const { error, count } = await client
      .from("tee_time_players")
      .delete({ count: "exact" })
      .in("tee_time_id", teeTimeIds);
    if (!error) deleted["tee_time_players"] = count ?? 0;
  }
  const tt = await deleteByTripId(client, "tee_times", testTripId);
  deleted[tt.table] = tt.deleted;
  return { module: "tee_times", deleted };
}

/**
 * Public entry point. `scope: "all"` wipes every data row across every
 * module for the test trip. Scoped to a specific module list otherwise.
 */
export async function wipeTestEventData(
  client: Client,
  testTripId: string,
  scope: "all" | { modules: ModuleName[] },
): Promise<WipeResult[]> {
  const modules: ModuleName[] =
    scope === "all"
      ? [
          // Order matters: clear deepest dependents first so cascades are
          // simple and predictable.
          "tee_times",
          "scramble",
          "daily_contests",
          "hundred_feet",
          "pickem",
          "calcutta",
          "cornhole",
          "kgb_cup",
          "roster",
        ]
      : scope.modules;

  const contestIds = await getContestIds(client, testTripId);
  const results: WipeResult[] = [];

  for (const m of modules) {
    switch (m) {
      case "roster":
        results.push(await wipeRoster(client, testTripId, contestIds));
        break;
      case "scramble":
        results.push(await wipeScramble(client, contestIds));
        break;
      case "daily_contests":
        results.push(await wipeDailyContests(client, contestIds));
        break;
      case "hundred_feet":
        results.push(await wipeHundredFeet(client, testTripId));
        break;
      case "pickem":
        results.push(await wipePickem(client, contestIds));
        break;
      case "calcutta":
        results.push(await wipeCalcutta(client, contestIds));
        break;
      case "cornhole":
        results.push(await wipeCornhole(client, contestIds));
        break;
      case "kgb_cup":
        results.push(await wipeKgbCup(client, contestIds));
        break;
      case "tee_times":
        results.push(await wipeTeeTimes(client, testTripId));
        break;
    }
  }
  return results;
}
