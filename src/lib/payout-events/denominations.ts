// Bill splits for the cash-needed sheet.
//
// "Greedy" minimizes bill count and is right when one person takes the whole
// envelope. But most of our payouts get DIVIDED — among teammates, among skin
// winners, etc. Sheiker shouldn't have to ask the winners to make change.
// `splitForRow` chooses a strategy per event kind so the bill mix matches
// how the cash will actually be subdivided.

import { computePayoutSplits, type PayoutSplit } from "./splits";

export const ALL_DENOMS = [100, 50, 20, 10, 5, 2, 1] as const;

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
  const perPlaceMixes: Array<Map<number, number>> = [];
  for (const [, amount] of placeAmounts) {
    if (amount <= 0) continue;
    const perMember = Math.round((amount / teamSize) * 100) / 100;
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
  const perDay = Math.round((total / dayCount) * 100) / 100;
  return multiply(splitGreedy(perDay, allowed), dayCount);
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
      return splitGreedy(row.total, allowedDenoms);
  }
}
