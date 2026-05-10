/**
 * Pickem-specific payout computation. Uses percentages from
 * `contests.payout_splits` (the unified payout-splits store, issue #124),
 * rounds each place down to the nearest $5, then redistributes the
 * leftover $5 chunks starting from the highest place (so 1st gets the
 * benefit of any rounding remainder).
 *
 * Single source for both:
 *   - `materializePickemWinners` (writes contest_winners.amount)
 *   - `PickemManager` admin UI (renders the preview alongside the
 *     splits editor)
 *
 * Storage shape on `contests.payout_splits`:
 *   `[{place: 1, kind: "percentage", amount: 50}, ...]`
 * where `amount` is the percentage (0–100).
 */

import type { PayoutSplit } from "@/lib/payout-events/splits";

export interface PickemPayout {
  place: number;
  percentage: number;
  amount: number;
}

const PICKEM_ROUND_TO = 5;

export function computePickemPayouts(
  totalPot: number,
  splits: PayoutSplit[] | null | undefined,
): PickemPayout[] {
  if (!Number.isFinite(totalPot) || totalPot <= 0) return [];
  if (!splits || splits.length === 0) return [];

  // Pull percentages from the splits config. Anything that isn't a
  // percentage entry is ignored — Pickem's payouts are percentage-based
  // by convention.
  const percents = splits
    .filter((s) => s.kind === "percentage")
    .map((s) => ({
      place: s.place,
      percentage: Math.max(0, Math.min(100, Number(s.amount) || 0)),
    }))
    .sort((a, b) => a.place - b.place);
  if (percents.length === 0) return [];

  // Floor each place down to the nearest $PICKEM_ROUND_TO.
  const results = percents.map((p) => ({
    place: p.place,
    percentage: p.percentage,
    amount:
      Math.floor((totalPot * p.percentage) / 100 / PICKEM_ROUND_TO) *
      PICKEM_ROUND_TO,
  }));

  // Distribute the remainder ($PICKEM_ROUND_TO chunks) starting from
  // place 1 — higher places benefit from rounding leftovers.
  const allocated = results.reduce((sum, r) => sum + r.amount, 0);
  let remaining = Math.max(0, totalPot - allocated);
  for (const r of results) {
    if (remaining >= PICKEM_ROUND_TO) {
      r.amount += PICKEM_ROUND_TO;
      remaining -= PICKEM_ROUND_TO;
    } else {
      break;
    }
  }
  return results;
}
