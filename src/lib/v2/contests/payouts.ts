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

/**
 * Sentinel `place` meaning "the LAST-ranked finisher" rather than a place counted from the
 * top. Lets an organizer offer e.g. "entry fee back for last" alongside the normal 1st/2nd/…
 * stack. Resolved to the bottom rank (tie-pooled) in distributePlacePayouts; sorts after all
 * real places in computePlacePayouts so a top `remainder` still wins. One per contest.
 */
export const LAST_PLACE = -1;
export const isLastPlace = (place: number): boolean => place === LAST_PLACE;
const sortKey = (place: number): number => (place === LAST_PLACE ? Number.MAX_SAFE_INTEGER : place);

const ordinal = (n: number): string => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
/** Human label for a payout place — "Last" for the sentinel, else an ordinal. */
export const placeLabel = (place: number): string => (place === LAST_PLACE ? "Last" : ordinal(place));

const normalizeKind = (k: string): PayoutKind =>
  k === "flat" || k === "remainder" || k === "single_winner" ? k : "percentage";

/**
 * Resolve each place to a cent amount (ports v1 computePayoutSplits). Priority: a single
 * winner takes the whole pot; otherwise FLAT amounts are carved off the top first, then
 * PERCENTAGES split the pool NET of those flats, then `remainder` absorbs whatever's left.
 *
 * Flats-first matters for a flat "last-place" (or any flat) prize alongside % places: "70%"
 * means 70% of the pot AFTER the flat carve-out, not of the gross pot. E.g. a $200 pot with a
 * $10 last-place prize → percentages are computed on $190 (70% = $133, not $140), so a 70/30
 * split + $10 last fully allocates the pot ($133 + $57 + $10 = $200). Only the first remainder
 * place is honored.
 */
export function computePlacePayouts(potCents: number, splits: PayoutSplit[] | null | undefined): PlacePayout[] {
  if (!splits?.length) return [];
  // Sort by place, but the LAST_PLACE sentinel always sorts after real places so a top
  // `remainder` (not a trailing "last" prize) is the one that absorbs the leftover.
  const rows = [...splits].sort((a, b) => sortKey(a.place) - sortKey(b.place));
  const pot = Math.max(0, Math.round(Number(potCents) || 0));

  const single = rows.find((s) => s.kind === "single_winner" || s.kind === "skins_proportional");
  if (single) return rows.map((s) => ({ place: s.place, kind: normalizeKind(s.kind), amountCents: s.place === single.place ? pot : 0 }));

  const byPlace = new Map<number, number>();

  // Pass 1 — flats come off the top (face value, capped so they never exceed the pot).
  let flatPool = pot;
  for (const s of rows) {
    if (s.kind !== "flat") continue;
    const amt = Math.min(Math.max(0, flatPool), Math.max(0, Math.round((Number(s.amount) || 0) * 100)));
    byPlace.set(s.place, amt);
    flatPool -= amt;
  }

  // Pass 2 — percentages split the net pool (pot − flats); remainder gets what's left of it.
  const base = flatPool; // pot minus all flat carve-outs
  let remaining = base;
  let remainderPlace: number | null = null;
  for (const s of rows) {
    if (s.kind === "flat") continue;
    if (s.kind === "remainder") { if (remainderPlace === null) remainderPlace = s.place; continue; }
    const amt = Math.round((Math.max(0, Math.min(100, Number(s.amount) || 0)) / 100) * base); // percentage
    byPlace.set(s.place, amt); remaining -= amt;
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

/**
 * Spread resolved place payouts across a ranked board, pooling tied ranks. A rank held
 * by k players occupies places [rank, rank+k-1]: those place amounts pool and split
 * evenly among the tied players (cent-exact). Returns cents-won per userId (winners only).
 *
 * `ranked` MUST be ordered by rank ascending (what rankPickem/rankStraight return). This
 * is the single source of truth for "a place's money → the people who hold it," shared by
 * the admin settlement sheet and the member-facing provisional ("if it ends now") display.
 */
export function distributePlacePayouts(
  ranked: { userId: string; rank: number }[],
  placePayouts: PlacePayout[],
): Map<string, number> {
  // The LAST_PLACE prize is resolved separately against the bottom rank; the rest stack
  // from the top as usual.
  const lastPayout = placePayouts.find((p) => p.place === LAST_PLACE) ?? null;
  const amountForPlace = new Map(placePayouts.filter((p) => p.place !== LAST_PLACE).map((p) => [p.place, p.amountCents]));
  const wonByUser = new Map<string, number>();
  const add = (uid: string, cents: number) => wonByUser.set(uid, (wonByUser.get(uid) ?? 0) + cents);
  let i = 0;
  while (i < ranked.length) {
    const rank = ranked[i].rank;
    const group: string[] = [];
    let j = i;
    while (j < ranked.length && ranked[j].rank === rank) { group.push(ranked[j].userId); j++; }
    const total = group.reduce((s, _u, k) => s + (amountForPlace.get(rank + k) ?? 0), 0);
    if (total > 0) splitAmongMembers(total, group.length).forEach((cents, k) => add(group[k], cents));
    i = j;
  }
  // Last-place prize → the bottom-ranked finisher(s), split if tied. Added on top (in a tiny
  // field the same player could hold both a top place and last; organizers set this for
  // normal fields, and += keeps that degenerate case coherent).
  if (lastPayout && lastPayout.amountCents > 0 && ranked.length > 0) {
    const maxRank = ranked.reduce((m, r) => Math.max(m, r.rank), 0);
    const lastGroup = ranked.filter((r) => r.rank === maxRank).map((r) => r.userId);
    splitAmongMembers(lastPayout.amountCents, lastGroup.length).forEach((cents, k) => add(lastGroup[k], cents));
  }
  return wonByUser;
}
