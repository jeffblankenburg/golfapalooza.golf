// Recompute the displayed amount on option-driven financial_transactions.
//
// `financial_transactions.amount` is set at insert time and never updated.
// Once cost_items became the source of truth for option prices (#125 Phase 3),
// the stored amount can drift any time admin edits a linked cost_item — the
// user's selection is unchanged but the price isn't. This helper derives the
// CURRENT amount per (user, option_id) pair so balances and ledgers display
// the live cost regardless of when the transaction was recorded.
//
// Apply this at the API boundary anywhere transactions are read for display
// or aggregation:
//   /api/admin/financials/balances   (recompute then sum)
//   /api/admin/financials/ledger
//   /api/admin/financials/transactions
//   /api/admin/financials/contest-ledger
//   /api/admin/financials/summary
//   /api/financials/me               (Loozer-facing)

import type { SupabaseClient } from "@supabase/supabase-js";
import { computeOptionCosts, type OptionLike } from "@/lib/cost-items/compute";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface TransactionLike {
  user_id: string;
  source: string;
  option_id: string | null;
  amount: number;
  // Other fields are passed through unchanged.
  [k: string]: unknown;
}

/**
 * Replace `amount` on every `source='option'` transaction with the value
 * computed from the user's CURRENT selection on that option, using the
 * option's CURRENT cost (derived from cost_items via computeOptionCosts).
 *
 * Returns a new array of transactions; input is not mutated.
 *
 * Behavior:
 *   - non-option transactions are passed through untouched
 *   - if no current selection exists for that (user, option), the stored
 *     amount is preserved as a fallback (this should be rare; the selections
 *     API deletes the transaction when the user clears their selection)
 *   - if the option has been deleted, the stored amount is preserved
 *
 * Performance: 2 bulk queries (options + selections) + 1 cost-item bulk query
 * inside computeOptionCosts. Independent of transactions.length.
 */
export async function applyComputedTransactionAmounts<T extends TransactionLike>(
  client: Client,
  transactions: T[],
): Promise<T[]> {
  if (!transactions || transactions.length === 0) return transactions;

  const optionTxs = transactions.filter(
    (t) => t.source === "option" && t.option_id,
  );
  if (optionTxs.length === 0) return transactions;

  const optionIds = [...new Set(optionTxs.map((t) => t.option_id as string))];
  const userIds = [...new Set(optionTxs.map((t) => t.user_id))];

  const [{ data: rawOptions }, { data: selections }] = await Promise.all([
    client.from("trip_options").select("*").in("id", optionIds),
    client
      .from("user_option_selections")
      .select("user_id, option_id, value")
      .in("user_id", userIds)
      .in("option_id", optionIds),
  ]);

  // computeOptionCosts overlays each option's cost / per-choice cost from
  // its linked cost_items.
  const options = await computeOptionCosts(client, (rawOptions || []) as OptionLike[]);
  const optionById = new Map(options.map((o) => [o.id, o]));
  const selByKey = new Map<string, unknown>();
  for (const s of (selections || []) as Array<{ user_id: string; option_id: string; value: unknown }>) {
    selByKey.set(`${s.user_id}|${s.option_id}`, s.value);
  }

  return transactions.map((tx) => {
    if (tx.source !== "option" || !tx.option_id) return tx;
    const opt = optionById.get(tx.option_id);
    if (!opt) return tx;
    const sel = selByKey.get(`${tx.user_id}|${tx.option_id}`);
    if (sel === undefined || sel === null) return tx;

    const computed = computeAmountFromSelection(opt, sel);
    if (computed === null) return tx;

    // Only override if the value actually differs (preserves identity for
    // most rows, useful for debugging).
    if (Number(tx.amount) === computed) return tx;
    return { ...tx, amount: computed };
  });
}

function computeAmountFromSelection(
  option: OptionLike,
  value: unknown,
): number | null {
  if (option.option_type === "checkbox") {
    if (value !== true) return null;
    const c = Number(option.cost ?? 0);
    return c > 0 ? c : null;
  }
  if (option.option_type === "select") {
    const matched = (option.choices || []).find((c) => c.value === value);
    if (!matched || matched.cost == null) return null;
    const n = Number(matched.cost);
    return n > 0 ? n : null;
  }
  if (option.option_type === "multi_select") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    let total = 0;
    for (const v of arr) {
      const matched = (option.choices || []).find((c) => c.value === v);
      if (matched?.cost) total += Number(matched.cost);
    }
    return total > 0 ? total : null;
  }
  return null;
}
