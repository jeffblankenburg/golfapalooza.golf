// Payout-split helper: turn a configured array of split rules + a pot total
// into a place→amount map. The `payout_splits` JSONB column on
// payout_sheet_events stores this config (admin-editable). Replaces the
// hardcoded "$80 to 2nd, remainder to 1st" rule that used to live in three
// places.
//
// Supported split kinds:
//   single_winner       — full pot to one place
//   flat                — fixed dollar amount (uses `amount`)
//   percentage          — percent of pot, 0–100 (uses `amount`)
//   remainder           — gets whatever's left after fixed/percentage rules
//   skins_proportional  — Skins-specific; calcSkins handles the actual
//                         distribution. Returns place 1 = full pot here so
//                         pot-level summaries still display the total.

export type PayoutSplitKind =
  | "single_winner"
  | "flat"
  | "percentage"
  | "remainder"
  | "skins_proportional";

export interface PayoutSplit {
  place: number;
  kind: PayoutSplitKind;
  amount?: number;
}

const ROUND2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Returns a Map<place, dollarAmount>. Splits are applied in priority order:
 * fixed amounts and percentages take their cut first, then `remainder`
 * absorbs whatever's left. `single_winner` and `skins_proportional` short-
 * circuit and assign the full pot to their place.
 */
export function computePayoutSplits(
  potTotal: number,
  splits: PayoutSplit[] | null | undefined,
): Map<number, number> {
  const out = new Map<number, number>();
  if (!Number.isFinite(potTotal) || potTotal <= 0) return out;
  if (!splits || splits.length === 0) return out;

  // Special-case: the whole pot goes to one place.
  const singleWinner = splits.find(
    (s) => s.kind === "single_winner" || s.kind === "skins_proportional",
  );
  if (singleWinner) {
    out.set(singleWinner.place, ROUND2(potTotal));
    return out;
  }

  // First pass: fixed amounts + percentages.
  let remaining = potTotal;
  let remainderPlace: number | null = null;
  for (const s of splits) {
    if (s.kind === "flat") {
      const amt = Math.min(remaining, Math.max(0, Number(s.amount) || 0));
      if (amt > 0) {
        out.set(s.place, ROUND2(amt));
        remaining -= amt;
      }
    } else if (s.kind === "percentage") {
      const pct = Math.max(0, Math.min(100, Number(s.amount) || 0));
      const amt = (pct / 100) * potTotal;
      if (amt > 0) {
        out.set(s.place, ROUND2(amt));
        remaining -= amt;
      }
    } else if (s.kind === "remainder") {
      if (remainderPlace !== null) {
        // Multiple "remainder" entries: only the first one is honoured.
        continue;
      }
      remainderPlace = s.place;
    }
  }

  if (remainderPlace !== null) {
    out.set(remainderPlace, ROUND2(Math.max(0, remaining)));
  }

  return out;
}

/** Convenience: returns the dollar amount for a specific place, or 0. */
export function payoutForPlace(
  potTotal: number,
  splits: PayoutSplit[] | null | undefined,
  place: number,
): number {
  return computePayoutSplits(potTotal, splits).get(place) ?? 0;
}
