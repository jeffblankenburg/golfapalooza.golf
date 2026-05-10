/**
 * Issue #128 — Calcutta auction generator.
 *
 * Calcutta participants are USERS being auctioned (one `contest_participants`
 * row per rostered Loozer). The `owner_id` is the buyer; `bid_amount`
 * the price; `auction_order` the auction order.
 *
 * Idempotent — clears bid info on existing rows first then re-fills.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { listTestEventContests, randInt, shuffle } from "../shared";
import type { GeneratorResult } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export async function generateCalcutta(
  client: Client,
  testTripId: string,
): Promise<GeneratorResult> {
  const warnings: string[] = [];
  const contests = await listTestEventContests(client, testTripId);
  const calcutta = contests.find((c) => c.contest_type === "calcutta");
  if (!calcutta) {
    return {
      module: "calcutta",
      inserted: 0,
      skipped: 0,
      warnings: ["No Calcutta contest configured in the test event — skipping."],
    };
  }

  const { data: roster } = await client
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", testTripId)
    .eq("on_roster", true);
  const userIds = (roster || []).map((r) => r.user_id as string);
  if (userIds.length < 2) {
    return {
      module: "calcutta",
      inserted: 0,
      skipped: 1,
      warnings: ["Need at least 2 rostered Loozers for a Calcutta auction."],
    };
  }

  // Wipe existing calcutta participants for this contest, then re-create.
  await client.from("contest_participants").delete().eq("contest_id", calcutta.id);

  // Each rostered Loozer becomes a participant. Random buyer (could be self)
  // with a bid biased toward perceived favorites — for sim purposes we use
  // a uniform $5–$50 spread.
  const buyers = [...userIds];
  const auctionOrder = shuffle([...userIds]);

  const rows = auctionOrder.map((auctioneeId, idx) => ({
    contest_id: calcutta.id,
    user_id: auctioneeId,
    auction_order: idx + 1,
    bid_amount: randInt(5, 50),
    owner_id: buyers[randInt(0, buyers.length - 1)],
    sold_at: new Date().toISOString(),
  }));

  const { error } = await client.from("contest_participants").insert(rows);
  if (error) {
    return {
      module: "calcutta",
      inserted: 0,
      skipped: rows.length,
      warnings: [error.message],
    };
  }

  // Calcutta winners flow through `calcutta_prizes` and the existing
  // resolver — we don't materialize anything here. The bid + owner data
  // is what the auction display needs.

  return { module: "calcutta", inserted: rows.length, skipped: 0, warnings };
}
