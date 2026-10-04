/**
 * Shared contest payout engine (#209). Every contest can carry %-of-pot splits per
 * place (`v2_contests.payout_splits`). The pot splits by place (whole-$5 bills), and a
 * place's winnings divide by contest type: INDIVIDUAL contests pay one person per place;
 * TEAM contests (scramble / Ryder) split a place's amount evenly among that team's
 * members. This module owns the math; who actually finishes where is per-type.
 */
import type { ContestType } from "@/lib/v2/contests";

// Mirrors v1's payout-split kinds (src/lib/payout-events/splits.ts): a place's cut is
// a % of the pot, a flat dollar amount, the remainder (whatever's left), or the whole
// pot (single winner). `amount` is a percent for "percentage" and DOLLARS for "flat".
export type PayoutKind = "percentage" | "flat" | "remainder" | "single_winner";
export interface PayoutSplit { place: number; kind: PayoutKind | string; amount?: number }
export interface PlacePayout { place: number; kind: PayoutKind; amountCents: number }

const normalizeKind = (k: string): PayoutKind =>
  k === "flat" || k === "remainder" || k === "single_winner" ? k : "percentage";

/**
 * Resolve each place to a cent amount (ports v1 computePayoutSplits). Priority: a single
 * winner takes the whole pot; otherwise flat amounts + percentages take their cut, then
 * `remainder` absorbs whatever's left. Only the first remainder place is honored.
 */
export function computePlacePayouts(potCents: number, splits: PayoutSplit[] | null | undefined): PlacePayout[] {
  if (!splits?.length) return [];
  const rows = [...splits].sort((a, b) => a.place - b.place);
  const pot = Math.max(0, Math.round(Number(potCents) || 0));

  const single = rows.find((s) => s.kind === "single_winner" || s.kind === "skins_proportional");
  if (single) return rows.map((s) => ({ place: s.place, kind: normalizeKind(s.kind), amountCents: s.place === single.place ? pot : 0 }));

  let remaining = pot;
  let remainderPlace: number | null = null;
  const byPlace = new Map<number, number>();
  for (const s of rows) {
    if (s.kind === "flat") {
      const amt = Math.min(Math.max(0, remaining), Math.max(0, Math.round((Number(s.amount) || 0) * 100)));
      byPlace.set(s.place, amt); remaining -= amt;
    } else if (s.kind === "remainder") {
      if (remainderPlace === null) remainderPlace = s.place;
    } else { // percentage
      const amt = Math.round((Math.max(0, Math.min(100, Number(s.amount) || 0)) / 100) * pot);
      byPlace.set(s.place, amt); remaining -= amt;
    }
  }
  if (remainderPlace !== null) byPlace.set(remainderPlace, Math.max(0, remaining));

  return rows.map((s) => ({ place: s.place, kind: normalizeKind(s.kind), amountCents: byPlace.get(s.place) ?? 0 }));
}

/** Team contests split a place's winnings among the team; individual contests pay one winner. */
export function isTeamContest(type: ContestType): boolean {
  return type === "scramble" || type === "ryder_cup";
}

/** Divide a place's amount evenly among N co-winners (teammates), exact to the cent (extra pennies to the first). */
export function splitAmongMembers(amountCents: number, memberCount: number): number[] {
  const n = Math.max(1, Math.floor(memberCount));
  const base = Math.floor(amountCents / n);
  const rem = amountCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}
