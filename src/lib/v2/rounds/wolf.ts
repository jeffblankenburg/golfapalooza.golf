/**
 * Wolf (#222) — the rotating-"Wolf" partners game for exactly four players. Unlike
 * the other side games, Wolf is NOT purely derived from scores: each hole the Wolf
 * makes a choice (take a partner, or go Lone Wolf), and that choice is a manual
 * input stored per hole in the game's config. Scoring then derives from the hole
 * scores once the pick is in.
 *
 * Rotation: the Wolf rotates by tee order — on an 18-hole round, holes 1–16 cycle
 * through the four players in `order`; on holes 17 & 18 the player in LAST place
 * (fewest points so far) is the Wolf (a common house rule). On a 9-hole round the
 * rotation simply cycles by playing position with no last-place twist.
 *
 * Scoring (zero-sum units; multiply by the stake for dollars):
 *   - Partner hole (2 v 2), ×1 best ball: the winning side each +1, the losing side
 *     each −1; a tie pushes (0).
 *   - Lone Wolf (1 v 3), ×2: the Wolf plays all three at 2 units each — win → +6 and
 *     each opponent −2; lose → −6 and each opponent +2; tie pushes.
 * A hole only scores once all four have a gross/net score AND a pick is recorded;
 * holes missing either are skipped (not fatal), so out-of-order entry is fine.
 */

export type WolfDecision = { partner: string } | { lone: true };

/**
 * How a partner hole (2 v 2) is decided when both sides' best ball ties:
 *   - "push"   — the hole is dead, nobody scores (standard Wolf, the default).
 *   - "second" — the side with the lower SECOND ball wins; equal second → push.
 *   - "total"  — the side with the lower two-ball total wins; equal total → push.
 * Lone Wolf (1 v 3) has a single ball, so its ties always push regardless.
 */
export type WolfTiebreak = "push" | "second" | "total";

export interface WolfHole {
  hole_number: number;
  wolf: string; // round_player_id who is the Wolf this hole (derived)
  decision: WolfDecision | null; // the recorded pick, or null if not made yet
  decided: boolean; // all four scored AND a pick recorded
  outcome: "wolf" | "opponents" | "push" | null; // who took the hole
  lone: boolean; // the Wolf went it alone
}

export interface WolfResult {
  perHole: WolfHole[];
  /** round_player_id → net units (can be negative). */
  points: Record<string, number>;
  /** Holes fully resolved (scored + picked). */
  decidedCount: number;
  /** Holes where everyone has a score but the Wolf hasn't picked yet. */
  pendingPicks: number[];
}

const LONE_UNIT = 2; // per-opponent multiplier when the Wolf goes alone (Classic 1/2/4)

/**
 * The player who is the Wolf on a given hole — pure helper so the scorer's pick
 * control and the standings agree. `pointsSoFar` is only consulted for the 17/18
 * last-place rule on a full 18.
 */
export function wolfForHole(
  holeNumber: number,
  position: number, // 0-based index of this hole among the round's holes in order
  order: string[],
  fullEighteen: boolean,
  pointsSoFar: Record<string, number>,
): string {
  if (fullEighteen && (holeNumber === 17 || holeNumber === 18)) {
    // Last place (lowest points) is the Wolf; ties break by rotation order.
    return [...order].sort(
      (a, b) => (pointsSoFar[a] ?? 0) - (pointsSoFar[b] ?? 0) || order.indexOf(a) - order.indexOf(b),
    )[0];
  }
  return order[position % order.length];
}

/**
 * @param holeNumbers  the round's holes in play order
 * @param scores       round_player_id → { hole_number → (net or gross) strokes }
 * @param order        the four participants in rotation (tee) order
 * @param decisions    hole_number → the Wolf's recorded pick
 * @param fullEighteen whether this is a full 18 (enables the 17/18 last-place rule)
 */
export function computeWolf(
  holeNumbers: number[],
  scores: Record<string, Record<number, number>>,
  order: string[],
  decisions: Record<number, WolfDecision>,
  fullEighteen: boolean,
  tiebreak: WolfTiebreak = "push",
): WolfResult {
  const points: Record<string, number> = {};
  for (const id of order) points[id] = 0;
  const perHole: WolfHole[] = [];
  const pendingPicks: number[] = [];
  let decidedCount = 0;

  const sorted = [...holeNumbers].sort((a, b) => a - b);
  sorted.forEach((h, pos) => {
    const wolf = wolfForHole(h, pos, order, fullEighteen, points);
    let decision: WolfDecision | null = decisions[h] ?? null;
    // Guard against a stale/invalid partner pick (e.g. the Wolf picked themselves,
    // or a player no longer in the game) — treat it as "not yet picked".
    if (decision && "partner" in decision && (decision.partner === wolf || !order.includes(decision.partner))) {
      decision = null;
    }

    const allScored = order.every((id) => scores[id]?.[h] != null);
    let outcome: WolfHole["outcome"] = null;
    const lone = !!decision && "lone" in decision;

    if (allScored && decision) {
      const wolfScore = scores[wolf][h];
      if ("lone" in decision) {
        const opps = order.filter((id) => id !== wolf);
        const bestOpp = Math.min(...opps.map((id) => scores[id][h]));
        if (wolfScore < bestOpp) {
          points[wolf] += LONE_UNIT * opps.length;
          for (const id of opps) points[id] -= LONE_UNIT;
          outcome = "wolf";
        } else if (wolfScore > bestOpp) {
          for (const id of opps) points[id] += LONE_UNIT;
          points[wolf] -= LONE_UNIT * opps.length;
          outcome = "opponents";
        } else {
          outcome = "push";
        }
      } else {
        const partner = decision.partner;
        const team = [wolf, partner];
        const opps = order.filter((id) => id !== wolf && id !== partner);
        const teamBest = Math.min(scores[wolf][h], scores[partner][h]);
        const oppBest = Math.min(...opps.map((id) => scores[id][h]));
        // Best ball decides; on a tie, apply the configured tiebreak (default push).
        let wolfSideWins: boolean | null = teamBest < oppBest ? true : teamBest > oppBest ? false : null;
        if (wolfSideWins === null && tiebreak !== "push") {
          const sideVal = (ids: string[]) =>
            tiebreak === "total"
              ? ids.reduce((sum, id) => sum + scores[id][h], 0)
              : Math.max(...ids.map((id) => scores[id][h])); // "second" = each side's higher ball
          const t = sideVal(team);
          const o = sideVal(opps);
          wolfSideWins = t < o ? true : t > o ? false : null;
        }
        if (wolfSideWins === true) {
          for (const id of team) points[id] += 1;
          for (const id of opps) points[id] -= 1;
          outcome = "wolf";
        } else if (wolfSideWins === false) {
          for (const id of opps) points[id] += 1;
          for (const id of team) points[id] -= 1;
          outcome = "opponents";
        } else {
          outcome = "push";
        }
      }
      decidedCount += 1;
    } else if (allScored && !decision) {
      pendingPicks.push(h);
    }

    perHole.push({ hole_number: h, wolf, decision, decided: !!(allScored && decision), outcome, lone });
  });

  return { perHole, points, decidedCount, pendingPicks };
}
