/**
 * Issue #128 — roster + enrollment generator.
 *
 * Inserts an `event_participants` row for every eligible Loozer with
 * `on_roster=true` and `likelihood=99`, then enrolls every rostered
 * Loozer in every payout-bearing contest in the test event (writes a
 * `contest_participants` row per pair).
 *
 * Idempotent within a run: deletes existing roster rows for the test
 * trip first, then re-inserts. So re-running this generator with the
 * same eligible-Loozer list converges on the same state.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listEligibleLoozers,
  listTestEventContests,
} from "../shared";
import type { GeneratorResult } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export async function generateRoster(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const loozers = await listEligibleLoozers(client);
  if (loozers.length === 0) {
    return {
      module: "roster",
      inserted: 0,
      skipped: 0,
      warnings: ["No eligible Loozers found (need is_active=true and non-system/non-financial-only)."],
    };
  }

  const contests = await listTestEventContests(client, testTripId);

  // Idempotent: clear existing roster for this test trip first.
  const { data: existingEp } = await client
    .from("event_participants")
    .select("id")
    .eq("trip_id", testTripId);
  if ((existingEp || []).length > 0) {
    await client
      .from("event_participants")
      .delete()
      .eq("trip_id", testTripId);
  }

  const contestIds = contests.map((c) => c.id);
  if (contestIds.length > 0) {
    await client
      .from("contest_participants")
      .delete()
      .in("contest_id", contestIds);
  }

  // Insert event_participants for every Loozer at likelihood=99, on_roster=true.
  const epRows = loozers.map((u) => ({
    trip_id: testTripId,
    user_id: u.id,
    likelihood: 99,
    on_roster: true,
  }));
  const { error: epErr } = await client.from("event_participants").insert(epRows);
  if (epErr) throw new Error(`generateRoster event_participants: ${epErr.message}`);

  // Enroll every Loozer in every contest that has a buy-in (i.e., is
  // payout-bearing). Calcutta is excluded — its participant model is the
  // bidder list, not the universal roster.
  const payoutContests = contests.filter(
    (c) =>
      c.contest_type !== "calcutta" &&
      // Pickem participation requires a `pickem_picks` row, not contest_participants
      c.contest_type !== "pickem",
  );

  let enrolled = 0;
  if (payoutContests.length > 0) {
    const cpRows: { contest_id: string; user_id: string }[] = [];
    for (const c of payoutContests) {
      for (const u of loozers) {
        cpRows.push({ contest_id: c.id, user_id: u.id });
      }
    }
    if (cpRows.length > 0) {
      const { error: cpErr } = await client.from("contest_participants").insert(cpRows);
      if (cpErr) throw new Error(`generateRoster contest_participants: ${cpErr.message}`);
      enrolled = cpRows.length;
    }
  } else {
    warnings.push("No payout-bearing contests found in the test event — only event_participants written.");
  }

  return {
    module: "roster",
    inserted: epRows.length + enrolled,
    skipped: 0,
    warnings,
  };
}
