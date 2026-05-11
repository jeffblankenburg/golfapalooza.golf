// Resolve the effective Pickem entry fee. Sole source of truth is
// `contests.buy_in_cost_item_id → cost_items.cost` (issue #125 Phase 5
// dropped the legacy `pickem_settings.entry_fee` column).

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface PickemEntryFeeResult {
  entry_fee: number;
  cost_item_id: string | null;
  source: "cost_item" | "none";
}

export async function getPickemEntryFee(
  client: Client,
  contestId: string,
): Promise<PickemEntryFeeResult> {
  const { data: contest } = await client
    .from("contests")
    .select("buy_in_cost_item_id, buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost)")
    .eq("id", contestId)
    .maybeSingle();

  const costItemId = (contest?.buy_in_cost_item_id as string | null) ?? null;
  const linked = contest?.buy_in_cost_item as { cost: number | string } | { cost: number | string }[] | null | undefined;
  const linkedCost = Array.isArray(linked) ? linked[0]?.cost : linked?.cost;

  if (costItemId && linkedCost != null) {
    return { entry_fee: Number(linkedCost), cost_item_id: costItemId, source: "cost_item" };
  }

  return { entry_fee: 0, cost_item_id: null, source: "none" };
}
