// Bill splits for the cash-needed sheet.
//
// "Greedy" minimizes bill count and is right when one person takes the whole
// envelope. But most of our payouts get DIVIDED — among teammates, among skin
// winners, etc. Sheiker shouldn't have to ask the winners to make change.
// `splitForRow` chooses a strategy per event kind so the bill mix matches
// how the cash will actually be subdivided.

import { computePayoutSplits, type PayoutSplit } from "./splits";

// $2 bills are deliberately omitted — they're not a realistic part of the
// cash mix Sheiker brings to the trip.
export const ALL_DENOMS = [100, 50, 20, 10, 5, 1] as const;

export const DEFAULT_TEAM_SIZE = 4;
// Legacy default 2nd-place flat. Used only when a row has no payout_splits
// configured. New rows are seeded with the same value via the backfill
// script and admin can edit per row in the modal.
export const SCRAMBLE_2ND_PLACE_AMOUNT = 80;

export function splitGreedy(
  amount: number,
  allowedDenoms: readonly number[] = ALL_DENOMS,
): Map<number, number> {
  const result = new Map<number, number>();
  if (!Number.isFinite(amount) || amount <= 0) return result;
  const sorted = [...allowedDenoms].sort((a, b) => b - a);
  let remaining = Math.round(amount * 100);
  for (const d of sorted) {
    const dCents = d * 100;
    if (dCents <= 0) continue;
    const count = Math.floor(remaining / dCents);
    if (count > 0) {
      result.set(d, count);
      remaining -= count * dCents;
    }
  }
  return result;
}

export function sumByDenom(maps: Iterable<Map<number, number>>): Map<number, number> {
  const out = new Map<number, number>();
  for (const m of maps) {
    for (const [denom, count] of m) {
      out.set(denom, (out.get(denom) || 0) + count);
    }
  }
  return out;
}

export function totalFromDenom(map: Map<number, number>): number {
  let total = 0;
  for (const [d, c] of map) total += d * c;
  return total;
}

function multiply(map: Map<number, number>, n: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [d, c] of map) out.set(d, c * n);
  return out;
}

// Round a fractional share UP to the smallest enabled denomination so the
// bill mix can represent it exactly. Winners get the rounded amount —
// e.g. a $17.50/day CTP becomes $18/day when $1 is on (overage of $1.50
// across 3 days), or $20/day when only $5+ are on (overage of $7.50).
// Keeps the cash-needed sheet honest: bills brought ≥ pot owed.
function smallestOf(allowed: readonly number[]): number {
  return allowed.length > 0 ? Math.min(...allowed) : 1;
}

function roundUpToDenom(amount: number, smallest: number): number {
  if (smallest <= 0 || amount <= 0) return amount;
  // Work in cents to avoid float drift.
  const cents = Math.ceil(amount * 100);
  const step = Math.round(smallest * 100);
  return (Math.ceil(cents / step) * step) / 100;
}

// Detect what kind of event a row represents purely from its label + source,
// for picking the right denomination strategy. Mirrors the classify logic in
// grid.ts but kept local to keep the denominations module self-contained.
export type EventKind =
  | "scramble_team"
  | "scramble_skins"
  | "ctp"
  | "long_drive"
  | "long_putt"
  | "hundred_feet"
  | "pickem"
  | "default";

export function classifyForDenoms(row: { label: string; participant_source: string }): EventKind {
  const lbl = row.label.toLowerCase();
  if (row.participant_source === "scramble") {
    if (lbl.includes("skins")) return "scramble_skins";
    if (lbl.includes("team")) return "scramble_team";
  }
  if (row.participant_source === "pickem_payments") return "pickem";
  if (lbl.includes("100") || lbl.includes("hundred")) return "hundred_feet";
  if (lbl.includes("par 3") || lbl.includes("ctp") || lbl.includes("closest")) return "ctp";
  if (lbl.includes("long drive") || lbl === "bro ld") return "long_drive";
  if (lbl.includes("long putt") || lbl === "bro lp") return "long_putt";
  return "default";
}

// Half $5 / half $10 — chosen for unpredictable per-recipient amounts (skins
// pots are split among multiple teams and then among teammates; we can't
// predict the share size, so we err on the side of small flexible bills).
function splitSkins(total: number, allowed: readonly number[]): Map<number, number> {
  if (total <= 0) return new Map();
  const has5 = allowed.includes(5);
  const has10 = allowed.includes(10);
  if (!has5 && !has10) return splitGreedy(total, allowed);
  if (!has10) {
    return splitGreedy(total, [5]);
  }
  if (!has5) {
    return splitGreedy(total, [10]);
  }
  // Even split between $5 and $10. Round each half to the nearest $10/$5
  // boundary so totals reconcile.
  const half = Math.round(total / 20) * 10;          // multiple of $10
  const tens = Math.floor(half / 10);
  const remainder = total - tens * 10;
  // Remainder must be a multiple of $5 (assumes pot is $5-divisible).
  const fives = Math.max(0, Math.round(remainder / 5));
  const out = new Map<number, number>();
  if (tens > 0) out.set(10, tens);
  if (fives > 0) out.set(5, fives);
  return out;
}

// Scramble Team: per-place amounts come from the row's admin-configured
// payout_splits (default for scramble_team: 1st = remainder, 2nd = $80 flat).
// Each team is divided among `teamSize` members (default 4), so the bill
// mix per place = teamSize × greedy(per-member share). Sum across all places.
function splitScrambleTeam(
  total: number,
  splits: PayoutSplit[] | null | undefined,
  allowed: readonly number[],
  teamSize: number = DEFAULT_TEAM_SIZE,
): Map<number, number> {
  if (total <= 0 || teamSize <= 0) return new Map();
  const placeAmounts = computePayoutSplits(total, splits ?? DEFAULT_SCRAMBLE_TEAM_SPLITS);
  const smallest = smallestOf(allowed);
  const perPlaceMixes: Array<Map<number, number>> = [];
  for (const [, amount] of placeAmounts) {
    if (amount <= 0) continue;
    const perMember = roundUpToDenom(amount / teamSize, smallest);
    perPlaceMixes.push(multiply(splitGreedy(perMember, allowed), teamSize));
  }
  return sumByDenom(perPlaceMixes);
}

const DEFAULT_SCRAMBLE_TEAM_SPLITS: PayoutSplit[] = [
  { place: 1, kind: "remainder" },
  { place: 2, kind: "flat", amount: SCRAMBLE_2ND_PLACE_AMOUNT },
];

// Daily contests (CTP, LD, LP) pay out per day to one winner per day. Bill
// mix = day_count × greedy(per-day amount).
function splitPerDay(
  total: number,
  dayCount: number,
  allowed: readonly number[],
): Map<number, number> {
  if (total <= 0 || dayCount <= 0) return new Map();
  const perDay = roundUpToDenom(total / dayCount, smallestOf(allowed));
  return multiply(splitGreedy(perDay, allowed), dayCount);
}

// ─────────────────────────────────────────────────────────────────────────
// Manual-control model (exact-sum). The row's pot is authoritative; the bill
// breakdown must sum to it. `suggestExactDenoms` seeds a mix that sums to the
// (whole-dollar) pot exactly — payee-aware so shares stay splittable — and the
// admin can override it entirely via the editor. No round-up inflation.
// ─────────────────────────────────────────────────────────────────────────

/** Whole-dollar target for bill math (payouts are paid in whole bills). */
export function denomTarget(total: number): number {
  return Math.max(0, Math.round(total));
}

/** Greedy fill of `target` dollars from `denoms`; returns the map + any part
 *  that couldn't be represented (e.g. $1–$4 left when $1 is disabled). */
function greedyExact(
  target: number,
  denoms: readonly number[],
): { map: Map<number, number>; remaining: number } {
  const map = new Map<number, number>();
  let remaining = target;
  for (const d of [...denoms].sort((a, b) => b - a)) {
    if (d <= 0) continue;
    const count = Math.floor(remaining / d);
    if (count > 0) {
      map.set(d, count);
      remaining -= count * d;
    }
  }
  return { map, remaining };
}

/** Suggest a bill mix that sums to the pot exactly (whole dollars). When a
 *  payee count is known, prefer bills no larger than one payee's share so the
 *  cash divides cleanly; fall back to the full set to finish the total. */
export function suggestExactDenoms(
  total: number,
  allowed: readonly number[] = ALL_DENOMS,
  payeeCount?: number | null,
): Map<number, number> {
  const target = denomTarget(total);
  if (target <= 0 || allowed.length === 0) return new Map();

  let denoms = allowed;
  if (payeeCount && payeeCount > 0) {
    const perPayee = Math.floor(target / payeeCount);
    const capped = allowed.filter((d) => d <= perPayee);
    if (capped.length > 0) denoms = capped;
  }

  const first = greedyExact(target, denoms);
  if (first.remaining === 0) return first.map;

  // Couldn't finish with the (capped) set — cover the rest with the full set.
  const rest = greedyExact(first.remaining, allowed);
  for (const [d, c] of rest.map) first.map.set(d, (first.map.get(d) || 0) + c);
  return first.map;
}

/** Parse a stored { "20": 3 } override into a numeric denom→count Map. */
export function overrideToMap(
  override: Record<string, number> | null | undefined,
): Map<number, number> {
  const map = new Map<number, number>();
  if (!override) return map;
  for (const [k, v] of Object.entries(override)) {
    const d = Number(k);
    const c = Number(v);
    if (Number.isFinite(d) && d > 0 && Number.isFinite(c) && c > 0) map.set(d, Math.round(c));
  }
  return map;
}

/** Serialize a denom→count Map back to the stored { "20": 3 } shape. */
export function mapToOverride(map: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [d, c] of map) if (c > 0) out[String(d)] = c;
  return out;
}

export interface EffectiveSplit {
  /** The bills to bring for this row. */
  map: Map<number, number>;
  /** Sum of the bills. */
  billedTotal: number;
  /** Whole-dollar target the bills should equal. */
  target: number;
  /** true when the admin hand-picked this breakdown. */
  isOverride: boolean;
  /** target − billedTotal. >0 means the bills fall short of the pot. */
  shortfall: number;
}

/**
 * The effective bill breakdown for a row: the admin's override when present,
 * otherwise a suggestion that sums to the pot exactly. Always reports the
 * whole-dollar target and any shortfall so the UI can flag mismatches.
 */
export function effectiveSplitForRow(
  row: {
    total: number;
    payee_count?: number | null;
    denomination_override?: Record<string, number> | null;
  },
  allowedDenoms: readonly number[] = ALL_DENOMS,
): EffectiveSplit {
  const target = denomTarget(row.total);
  const override = overrideToMap(row.denomination_override);
  const map = override.size > 0 ? override : suggestExactDenoms(row.total, allowedDenoms, row.payee_count);
  const billedTotal = totalFromDenom(map);
  return {
    map,
    billedTotal,
    target,
    isOverride: override.size > 0,
    shortfall: target - billedTotal,
  };
}

export function splitForRow(
  row: {
    label: string;
    participant_source: string;
    day_count: number;
    total: number;
    payout_splits?: PayoutSplit[] | null;
  },
  allowedDenoms: readonly number[] = ALL_DENOMS,
  opts: { teamSize?: number } = {},
): Map<number, number> {
  const kind = classifyForDenoms(row);
  switch (kind) {
    case "scramble_team":
      return splitScrambleTeam(row.total, row.payout_splits ?? null, allowedDenoms, opts.teamSize ?? DEFAULT_TEAM_SIZE);
    case "scramble_skins":
      return splitSkins(row.total, allowedDenoms);
    case "ctp":
    case "long_drive":
    case "long_putt":
      return splitPerDay(row.total, row.day_count || 1, allowedDenoms);
    case "hundred_feet":
    case "pickem":
    case "default":
    default:
      return splitGreedy(roundUpToDenom(row.total, smallestOf(allowedDenoms)), allowedDenoms);
  }
}
