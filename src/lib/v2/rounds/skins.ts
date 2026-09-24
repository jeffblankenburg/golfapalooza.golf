/**
 * Skins scoring (#183). Lowest score on a hole wins that hole's skin; ties carry
 * the skin to the next hole, so a later winner can sweep several at once. Pure and
 * derived entirely from per-hole scores — call it live from the scorer.
 *
 * Live semantics: holes are resolved in order; the first hole not yet scored by
 * every participant stops resolution (later holes stay pending), and any unresolved
 * skins show as "carrying".
 */

export interface SkinsResult {
  /** Per resolved hole: who won it (round_player_id) or null when it carried. */
  perHole: { hole_number: number; winner: string | null; skins: number }[];
  /** round_player_id → skins won. */
  wonBy: Record<string, number>;
  /** Skins currently carried (unresolved ties waiting on the next decisive hole). */
  carrying: number;
  /** How many holes have been fully scored + resolved. */
  resolved: number;
}

/**
 * @param holeNumbers  the round's holes in play order
 * @param scores       round_player_id → { hole_number → (net or gross) strokes }
 * @param participantIds  round_player_ids in the game
 */
export function computeSkins(
  holeNumbers: number[],
  scores: Record<string, Record<number, number>>,
  participantIds: string[],
): SkinsResult {
  const perHole: SkinsResult["perHole"] = [];
  const wonBy: Record<string, number> = {};
  for (const id of participantIds) wonBy[id] = 0;
  let carry = 0;
  let resolved = 0;

  for (const h of holeNumbers) {
    // Every participant must have a score for this hole to resolve it.
    const entries = participantIds.map((id) => ({ id, s: scores[id]?.[h] }));
    if (entries.some((e) => e.s == null)) break;

    const low = Math.min(...entries.map((e) => e.s as number));
    const winners = entries.filter((e) => e.s === low);
    const atStake = carry + 1;
    if (winners.length === 1) {
      const w = winners[0].id;
      wonBy[w] = (wonBy[w] ?? 0) + atStake;
      perHole.push({ hole_number: h, winner: w, skins: atStake });
      carry = 0;
    } else {
      perHole.push({ hole_number: h, winner: null, skins: atStake });
      carry = atStake; // tie: the pot rolls to the next hole
    }
    resolved += 1;
  }

  return { perHole, wonBy, carrying: carry, resolved };
}
