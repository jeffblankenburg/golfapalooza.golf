/**
 * Issue #128 — Pickem generator.
 *
 * Steps (idempotent):
 *   1. Ensure `pickem_settings` row exists for the Pickem contest.
 *   2. Wipe existing `pickem_games` + `pickem_picks` for that contest.
 *   3. Create 10 fake games with random away/home teams, a spread, a
 *      decided `winning_team`, and one tiebreaker game with a final
 *      score total.
 *   4. For every rostered Loozer × every game, write a `pickem_picks`
 *      row with a random pick (and a tiebreaker_total on the
 *      tiebreaker game).
 *   5. Trigger the materializer to populate `contest_winners` from the
 *      ranking + `payout_splits` on the contest.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTestEventContests, randInt, weightedPick } from "../shared";
import type { GeneratorResult } from "../types";
import { materializeContestWinners } from "@/lib/winners/materialize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

const FAKE_TEAMS = [
  "Beavers", "Wolves", "Eagles", "Tigers", "Bulldogs",
  "Hawks", "Panthers", "Bears", "Knights", "Wildcats",
  "Spartans", "Lions", "Cardinals", "Buckeyes", "Wolverines",
  "Hoosiers", "Boilermakers", "Cornhuskers", "Sooners", "Aggies",
];

const GAME_COUNT = 10;

function pickRandomTwoTeams(): { away: string; home: string } {
  const shuffled = [...FAKE_TEAMS].sort(() => Math.random() - 0.5);
  return { away: shuffled[0], home: shuffled[1] };
}

export async function generatePickem(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const contests = await listTestEventContests(client, testTripId);
  const pickem = contests.find((c) => c.contest_type === "pickem");

  if (!pickem) {
    return {
      module: "pickem",
      inserted: 0,
      skipped: 0,
      warnings: ["No Pickem contest configured in the test event — skipping."],
    };
  }

  const { data: roster } = await client
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", testTripId)
    .eq("on_roster", true);
  const userIds = (roster || []).map((r) => r.user_id as string);
  if (userIds.length === 0) {
    return {
      module: "pickem",
      inserted: 0,
      skipped: 1,
      warnings: ["Roster is empty — run the roster generator first."],
    };
  }

  // 1. Ensure pickem_settings (is_open only — entry fee lives on the
  //    contest's buy_in_cost_item_id since issue #125 Phase 4).
  const { data: existingSettings } = await client
    .from("pickem_settings")
    .select("id")
    .eq("contest_id", pickem.id)
    .maybeSingle();
  if (!existingSettings) {
    const { error } = await client.from("pickem_settings").insert({
      contest_id: pickem.id,
      is_open: true,
    });
    if (error) warnings.push(`pickem_settings: ${error.message}`);
  }

  // Link the contest to the "Pickem entry" cost_item if not already linked.
  const { data: contestRow } = await client
    .from("contests")
    .select("buy_in_cost_item_id")
    .eq("id", pickem.id)
    .maybeSingle();
  if (!contestRow?.buy_in_cost_item_id) {
    const { data: pickemCostItem } = await client
      .from("cost_items")
      .select("id")
      .eq("trip_id", testTripId)
      .eq("name", "Pickem entry")
      .maybeSingle();
    if (pickemCostItem?.id) {
      const { error } = await client
        .from("contests")
        .update({ buy_in_cost_item_id: pickemCostItem.id })
        .eq("id", pickem.id);
      if (error) warnings.push(`contests.buy_in_cost_item_id: ${error.message}`);
    } else {
      warnings.push("No 'Pickem entry' cost_item in test trip — entry fee will read as $0.");
    }
  }

  // 2. Wipe games + picks.
  const { data: existingGames } = await client
    .from("pickem_games")
    .select("id")
    .eq("contest_id", pickem.id);
  const oldGameIds = (existingGames || []).map((g) => g.id as string);
  if (oldGameIds.length > 0) {
    await client.from("pickem_picks").delete().in("game_id", oldGameIds);
    await client.from("pickem_games").delete().in("id", oldGameIds);
  }
  await client.from("contest_winners").delete().eq("contest_id", pickem.id);

  // 3. Insert 10 fake games (last one is the tiebreaker).
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - 1); // games already decided
  const gameRows: Record<string, unknown>[] = [];
  for (let i = 0; i < GAME_COUNT; i++) {
    const { away, home } = pickRandomTwoTeams();
    const favorite = Math.random() < 0.5 ? "away" : "home";
    const winning = Math.random() < 0.5 ? "away" : "home";
    const isTiebreaker = i === GAME_COUNT - 1;
    gameRows.push({
      contest_id: pickem.id,
      away_team: away,
      home_team: home,
      spread: (randInt(15, 200) / 10), // 1.5 to 20.0
      favorite,
      game_time: new Date(baseDate.getTime() + i * 60 * 60 * 1000).toISOString(),
      is_tiebreaker: isTiebreaker,
      winning_team: winning,
      away_score: randInt(7, 42),
      home_score: randInt(7, 42),
    });
  }
  const { data: insertedGames, error: gameErr } = await client
    .from("pickem_games")
    .insert(gameRows)
    .select("id, is_tiebreaker, away_score, home_score");
  if (gameErr || !insertedGames) {
    return {
      module: "pickem",
      inserted: 0,
      skipped: gameRows.length,
      warnings: [gameErr?.message || "pickem_games insert failed"],
    };
  }

  let totalInserted = insertedGames.length;
  const tieGame = insertedGames.find((g) => g.is_tiebreaker);
  const tieTotal = tieGame ? (tieGame.away_score ?? 0) + (tieGame.home_score ?? 0) : 0;

  // 4. Picks.
  const pickRows: Record<string, unknown>[] = [];
  for (const userId of userIds) {
    for (const game of insertedGames) {
      const picked = weightedPick<"away" | "home">([
        ["away", 50],
        ["home", 50],
      ]);
      pickRows.push({
        game_id: game.id,
        user_id: userId,
        picked_team: picked,
        // Tiebreaker total: random ±15 around the actual tiebreaker total.
        tiebreaker_total: game.is_tiebreaker
          ? Math.max(0, tieTotal + randInt(-15, 15))
          : null,
      });
    }
  }
  const { error: pickErr } = await client.from("pickem_picks").insert(pickRows);
  if (pickErr) warnings.push(`pickem_picks: ${pickErr.message}`);
  else totalInserted += pickRows.length;

  // 5. Materialize.
  await materializeContestWinners(client, pickem.id).catch((err) => {
    warnings.push(`Pickem materialize failed — ${(err as Error).message}`);
  });

  return { module: "pickem", inserted: totalInserted, skipped: 0, warnings };
}
