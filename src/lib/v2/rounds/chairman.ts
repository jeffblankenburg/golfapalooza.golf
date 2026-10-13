/**
 * Chairman (#222) — a "king of the hill" game. The first player to win a hole
 * outright (unique low score) becomes the Chairman, but earns nothing for the
 * coronation. From then on, each decided hole:
 *   - Chairman posts the unique low  → +1 point, keeps the chair.
 *   - A different player posts the unique low → they become the new Chairman,
 *     no point (a dethroning, not a score).
 *   - Any tie for low (whether or not the Chairman is in it) → no point, the
 *     Chairman is unchanged. This single rule subsumes "Chairman ties for low →
 *     stays, no points" and the mirror case where two challengers tie.
 *
 * Pure and derived entirely from per-hole scores (gross or net) — call it live
 * from the scorer. Holes resolve in order; the first hole not yet scored by every
 * participant stops resolution (later holes stay pending).
 */

export interface ChairmanResult {
  /** Per resolved hole: the unique-low winner (round_player_id) or null on a tie,
   *  who held the chair AFTER the hole, whether a point was scored, and whether
   *  this hole crowned a new Chairman (first coronation or a dethroning). */
  perHole: {
    hole_number: number;
    winner: string | null;
    chairman: string | null;
    point: boolean;
    crowned: boolean;
  }[];
  /** round_player_id → points earned. */
  points: Record<string, number>;
  /** Who currently holds the chair (round_player_id), or null before anyone has
   *  won a hole outright. */
  chairman: string | null;
  /** How many holes have been fully scored + resolved. */
  resolved: number;
}

/**
 * @param holeNumbers     the round's holes in play order
 * @param scores          round_player_id → { hole_number → (net or gross) strokes }
 * @param participantIds  round_player_ids in the game
 */
export function computeChairman(
  holeNumbers: number[],
  scores: Record<string, Record<number, number>>,
  participantIds: string[],
): ChairmanResult {
  const perHole: ChairmanResult["perHole"] = [];
  const points: Record<string, number> = {};
  for (const id of participantIds) points[id] = 0;
  let chairman: string | null = null;
  let resolved = 0;

  for (const h of holeNumbers) {
    // Every participant must have a score for this hole to resolve it.
    const entries = participantIds.map((id) => ({ id, s: scores[id]?.[h] }));
    if (entries.some((e) => e.s == null)) break;

    const low = Math.min(...entries.map((e) => e.s as number));
    const winners = entries.filter((e) => e.s === low);

    if (winners.length === 1) {
      const w = winners[0].id;
      if (chairman === null) {
        // First outright winner takes the chair — no point for the coronation.
        chairman = w;
        perHole.push({ hole_number: h, winner: w, chairman, point: false, crowned: true });
      } else if (w === chairman) {
        // Chairman defends → scores a point.
        points[w] = (points[w] ?? 0) + 1;
        perHole.push({ hole_number: h, winner: w, chairman, point: true, crowned: false });
      } else {
        // A challenger wins outright → new Chairman, no point.
        chairman = w;
        perHole.push({ hole_number: h, winner: w, chairman, point: false, crowned: true });
      }
    } else {
      // Tie for low — nobody won the hole outright. Chairman unchanged, no point.
      perHole.push({ hole_number: h, winner: null, chairman, point: false, crowned: false });
    }
    resolved += 1;
  }

  return { perHole, points, chairman, resolved };
}
