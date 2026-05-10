/**
 * Issue #128 — daily contest winners generator.
 *
 * For each daily contest in the test event (CTP front, CTP back,
 * Long Drive, Long Putt × 3 days), pick a random eligible Loozer as
 * the place=1 winner. The materializer fills in the `amount` from
 * the contest's pot × splits.
 *
 * Idempotent — clears existing winner rows first then re-picks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTestEventContests, randInt } from "../shared";
import type { GeneratorResult } from "../types";
import { materializeContestWinners } from "@/lib/winners/materialize";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

const DAILY_TYPES = ["ctp_front", "ctp_back", "long_drive", "long_putt"];

export async function generateDailyContests(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const contests = await listTestEventContests(client, testTripId);
  const dailies = contests.filter((c) => DAILY_TYPES.includes(c.contest_type));

  if (dailies.length === 0) {
    return {
      module: "daily_contests",
      inserted: 0,
      skipped: 0,
      warnings: ["No daily contests configured in the test event — skipping."],
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
      module: "daily_contests",
      inserted: 0,
      skipped: dailies.length,
      warnings: ["Roster is empty — run the roster generator first."],
    };
  }

  // Idempotent: clear existing winner rows for these contests.
  const dailyIds = dailies.map((c) => c.id);
  await client.from("contest_winners").delete().in("contest_id", dailyIds);

  let inserted = 0;
  for (const contest of dailies) {
    const winnerId = userIds[randInt(0, userIds.length - 1)];
    const { error } = await client.from("contest_winners").insert({
      contest_id: contest.id,
      place: 1,
      user_id: winnerId,
      amount: 0, // materializer fills this in from pot × splits
      determined_by: "rule",
    });
    if (error) {
      warnings.push(`${contest.name}: ${error.message}`);
      continue;
    }
    inserted += 1;
    await materializeContestWinners(client, contest.id).catch((err) => {
      warnings.push(`${contest.name}: materialize failed — ${(err as Error).message}`);
    });
  }

  return { module: "daily_contests", inserted, skipped: 0, warnings };
}
