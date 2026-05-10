/**
 * Issue #128 — tee times generator.
 *
 * For each scramble contest in the test event, generate one tee_times
 * row per team, starting at 8:00 with 8-min increments. Each tee time
 * gets a `tee_time_players` row for every member of the team plus the
 * scramble_team_id linkage so the home page's tee-time card resolves.
 *
 * Idempotent — wipes existing tee_times for the test trip first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTestEventContests } from "../shared";
import type { GeneratorResult } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

const FIRST_TEE_TIME = 8 * 60; // 8:00 AM in minutes
const SLOT_INTERVAL_MINUTES = 8;

function minutesToTimeString(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export async function generateTeeTimes(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const contests = await listTestEventContests(client, testTripId);
  const scrambles = contests.filter((c) => c.contest_type === "scramble");

  if (scrambles.length === 0) {
    return {
      module: "tee_times",
      inserted: 0,
      skipped: 0,
      warnings: ["No scramble contests configured — tee times need scrambles to assign teams to."],
    };
  }

  // Wipe existing tee times for the test trip (CASCADE clears tee_time_players).
  await client.from("tee_times").delete().eq("trip_id", testTripId);

  let inserted = 0;
  for (const contest of scrambles) {
    if (contest.day_number == null) continue;

    const { data: teams } = await client
      .from("scramble_teams")
      .select("id, scramble_team_members(user_id)")
      .eq("contest_id", contest.id)
      .order("created_at");

    if (!teams || teams.length === 0) {
      warnings.push(`Day ${contest.day_number}: no scramble teams — run the scramble generator first.`);
      continue;
    }

    for (let i = 0; i < teams.length; i++) {
      const team = teams[i] as {
        id: string;
        scramble_team_members: { user_id: string }[] | { user_id: string };
      };
      const teeMinutes = FIRST_TEE_TIME + i * SLOT_INTERVAL_MINUTES;

      const { data: tt, error: ttErr } = await client
        .from("tee_times")
        .insert({
          trip_id: testTripId,
          day_number: contest.day_number,
          tee_time: minutesToTimeString(teeMinutes),
          starting_hole: 1,
          scramble_team_id: team.id,
        })
        .select("id")
        .single();

      if (ttErr || !tt) {
        warnings.push(`Day ${contest.day_number} team ${i + 1}: ${ttErr?.message}`);
        continue;
      }
      inserted += 1;

      const members = Array.isArray(team.scramble_team_members)
        ? team.scramble_team_members
        : [team.scramble_team_members];
      const memberRows = members
        .filter((m) => m && m.user_id)
        .map((m) => ({ tee_time_id: tt.id as string, user_id: m.user_id }));
      if (memberRows.length > 0) {
        const { error: tpErr } = await client.from("tee_time_players").insert(memberRows);
        if (tpErr) warnings.push(`Day ${contest.day_number} tee_time_players: ${tpErr.message}`);
        else inserted += memberRows.length;
      }
    }
  }

  return { module: "tee_times", inserted, skipped: 0, warnings };
}
