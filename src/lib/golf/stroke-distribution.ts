/**
 * Handicap stroke distribution for scramble contests.
 *
 * Strokes are distributed across holes by difficulty ranking
 * (handicap_index ascending — 1 = hardest hole gets first stroke).
 */

export interface HoleWithHandicap {
  hole_number: number;
  handicap_index: number;
}

/**
 * Sort holes by difficulty (handicap_index ascending) and return the sorted array.
 */
export function sortByDifficulty(holes: HoleWithHandicap[]): HoleWithHandicap[] {
  return [...holes].sort((a, b) => a.handicap_index - b.handicap_index);
}

/**
 * Calculate how many handicap strokes a team gets on a specific hole.
 *
 * @param teamHandicap - The team's total handicap strokes
 * @param holeNumber - The hole number to check
 * @param sortedHoles - Holes sorted by difficulty (handicap_index ascending)
 * @returns Number of strokes the team receives on this hole
 */
export function getStrokesOnHole(
  teamHandicap: number,
  holeNumber: number,
  sortedHoles: HoleWithHandicap[]
): number {
  const holeRank = sortedHoles.findIndex((h) => h.hole_number === holeNumber);
  if (holeRank === -1) return 0;
  const fullPasses = Math.floor(teamHandicap / 18);
  const remainder = teamHandicap % 18;
  return fullPasses + (holeRank < remainder ? 1 : 0);
}

/**
 * Strokes received on a hole given the hole's own stroke index
 * (`handicap_index`, where 1 = hardest hole gets the first stroke). Use this
 * when you already know a hole's index and don't need to re-rank a subset —
 * e.g. showing "pops" on a live scorecard.
 *
 * @param handicap - The player's (already group-adjusted) handicap strokes
 * @param holeHandicapIndex - The hole's stroke index (1–18)
 */
export function strokesByHoleIndex(
  handicap: number,
  holeHandicapIndex: number,
  totalHoles = 18
): number {
  if (handicap <= 0) return 0;
  const fullPasses = Math.floor(handicap / totalHoles);
  const remainder = handicap % totalHoles;
  return fullPasses + (holeHandicapIndex <= remainder ? 1 : 0);
}
