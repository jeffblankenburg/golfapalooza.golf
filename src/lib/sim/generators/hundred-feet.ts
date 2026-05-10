/**
 * Issue #128 — 100 Feet distances generator.
 *
 * Per rostered Loozer, per scramble day, write a `hundred_feet_scores`
 * row with feet/inches. Distribution:
 *   - ~30% "100ft default" (no successful putt; default in the schema)
 *   - ~50% missed but in the 20–60 ft range
 *   - ~20% close shot in the 5–20 ft range
 *
 * After writing, materializes the 100 Feet contest's winner row.
 *
 * Idempotent — clears existing scores for the test trip first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTestEventContests, weightedPick, randInt } from "../shared";
import type { GeneratorResult } from "../types";
import { materializeContestWinners } from "@/lib/winners/materialize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

const SCRAMBLE_DAYS = [2, 3, 4];

function pickFeetInches(): { feet: number; inches: number } {
  const bucket = weightedPick<"miss" | "medium" | "close">([
    ["miss", 30],
    ["medium", 50],
    ["close", 20],
  ]);
  if (bucket === "miss") return { feet: 100, inches: 0 };
  if (bucket === "medium") return { feet: randInt(20, 60), inches: randInt(0, 11) };
  return { feet: randInt(5, 20), inches: randInt(0, 11) };
}

export async function generateHundredFeet(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const contests = await listTestEventContests(client, testTripId);
  const hf = contests.find(
    (c) => c.contest_type === "other" && c.name.toLowerCase().includes("feet"),
  );

  if (!hf) {
    return {
      module: "hundred_feet",
      inserted: 0,
      skipped: 0,
      warnings: ["No 100 Feet contest configured in the test event — skipping."],
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
      module: "hundred_feet",
      inserted: 0,
      skipped: 1,
      warnings: ["Roster is empty — run the roster generator first."],
    };
  }

  // Idempotent: clear existing scores for the test trip.
  await client.from("hundred_feet_scores").delete().eq("trip_id", testTripId);

  const rows: { trip_id: string; user_id: string; day_number: number; feet: number; inches: number }[] = [];
  for (const userId of userIds) {
    for (const day of SCRAMBLE_DAYS) {
      const { feet, inches } = pickFeetInches();
      rows.push({ trip_id: testTripId, user_id: userId, day_number: day, feet, inches });
    }
  }

  const { error } = await client.from("hundred_feet_scores").insert(rows);
  if (error) {
    return {
      module: "hundred_feet",
      inserted: 0,
      skipped: rows.length,
      warnings: [error.message],
    };
  }

  await materializeContestWinners(client, hf.id).catch((err) => {
    warnings.push(`100 Feet materialize failed — ${(err as Error).message}`);
  });

  return { module: "hundred_feet", inserted: rows.length, skipped: 0, warnings };
}
