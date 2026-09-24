/**
 * USGA World Handicap System math — lifted VERBATIM from the legacy engine
 * (src/lib/golf/calculator.ts). Pure functions, no DB or UI deps, so it's shared
 * unchanged by v2. The v2 recalc pipeline (handicap.ts / recalc.ts) builds on it.
 *
 *   Score Differential = (113 / Slope) × (Adjusted Gross − Course Rating)
 *   Handicap Index      = average of the best N of the last 20 differentials
 *   Net Double Bogey    = Par + 2 + strokes received (per hole adjusted-gross cap)
 */

export interface RoundDifferential {
  round_id?: string;
  round_date?: string;
  course_name?: string;
  adjusted_gross_score?: number;
  course_rating?: number;
  slope_rating?: number;
  differential: number;
}

export interface HandicapCalculation {
  handicap_index: number;
  rounds_used: number;
  total_rounds: number;
  calculation_method: string;
  differentials: RoundDifferential[];
  low_handicap_index: number;
}

// WHS table for number of differentials to use (by how many rounds are on file).
const WHS_TABLE = [
  { min: 3, max: 3, use: 1, adjustment: -2 },
  { min: 4, max: 4, use: 1, adjustment: -1 },
  { min: 5, max: 5, use: 1, adjustment: 0 },
  { min: 6, max: 6, use: 2, adjustment: -1 },
  { min: 7, max: 8, use: 2, adjustment: 0 },
  { min: 9, max: 11, use: 3, adjustment: 0 },
  { min: 12, max: 14, use: 4, adjustment: 0 },
  { min: 15, max: 16, use: 5, adjustment: 0 },
  { min: 17, max: 18, use: 6, adjustment: 0 },
  { min: 19, max: 19, use: 7, adjustment: 0 },
  { min: 20, max: Infinity, use: 8, adjustment: 0 },
];

/** Score Differential = (113 / Slope) × (Adjusted Gross − Course Rating). */
export function calculateDifferential(
  adjustedGrossScore: number,
  courseRating: number,
  slopeRating: number,
): number {
  const differential = (113 / slopeRating) * (adjustedGrossScore - courseRating);
  return Math.round(differential * 10) / 10;
}

/**
 * Course Handicap (raw / unrounded) = HI × (Slope / 113) + (Course Rating − Par).
 * The rounded variant is the WHS standard for stroke allocation / Net Double
 * Bogey; the raw value is used only where summing needs to avoid rounding drift.
 */
export function calculateCourseHandicapRaw(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number,
): number {
  return handicapIndex * (slopeRating / 113) + (courseRating - par);
}

/** Course Handicap (rounded — WHS standard). */
export function calculateCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number,
): number {
  return Math.round(calculateCourseHandicapRaw(handicapIndex, slopeRating, courseRating, par));
}

/**
 * Handicap strokes a player receives on a hole, by its stroke index
 * (handicap_index 1–18). full = ⌊CH/18⌋ on every hole; one extra on the CH%18
 * hardest holes. Used for net games (#183) and Net Double Bogey.
 */
export function strokesReceivedOnHole(holeHandicapIndex: number, courseHandicap: number): number {
  const full = Math.floor(courseHandicap / 18);
  const remaining = courseHandicap % 18;
  const extra = remaining >= holeHandicapIndex ? 1 : 0;
  return Math.max(0, full + extra);
}

/** Net Double Bogey max for a hole = Par + 2 + strokes received on the hole. */
export function calculateMaxScore(
  holePar: number,
  holeHandicapIndex: number,
  playerCourseHandicap: number,
): number {
  return holePar + 2 + strokesReceivedOnHole(holeHandicapIndex, playerCourseHandicap);
}

/** Adjusted gross = sum of each hole capped at its Net Double Bogey. */
export function calculateAdjustedGrossScore(
  holeScores: { strokes: number; par: number; handicap_index: number }[],
  courseHandicap: number,
): number {
  let adjustedTotal = 0;
  for (const hole of holeScores) {
    const maxScore = calculateMaxScore(hole.par, hole.handicap_index, courseHandicap);
    adjustedTotal += Math.min(hole.strokes, maxScore);
  }
  return adjustedTotal;
}

/**
 * Handicap Index from a player's recent differentials (USGA WHS), with soft/hard
 * caps against their lowest index in the last 12 months.
 *
 * @param currentLowHandicapIndex player_handicaps.low_handicap_index; null on first calc.
 */
export function calculateHandicapIndex(
  differentials: RoundDifferential[],
  currentLowHandicapIndex?: number | null,
): HandicapCalculation | null {
  const count = differentials.length;
  if (count < 3) return null;

  const sorted = [...differentials].sort((a, b) => a.differential - b.differential);
  const rule = WHS_TABLE.find((r) => count >= r.min && count <= r.max);
  if (!rule) return null;

  const used = sorted.slice(0, rule.use);
  const sum = used.reduce((acc, d) => acc + d.differential, 0);
  const average = sum / rule.use;

  // WHS truncates to 1 decimal (not rounds).
  let handicapIndex = Math.floor((average + rule.adjustment) * 10) / 10;
  handicapIndex = Math.max(0, handicapIndex);

  const lowHI =
    currentLowHandicapIndex != null
      ? Math.min(currentLowHandicapIndex, handicapIndex)
      : handicapIndex;

  // Soft cap: excess over low HI + 3.0 is halved.
  if (currentLowHandicapIndex != null && handicapIndex > currentLowHandicapIndex + 3.0) {
    const excess = handicapIndex - (currentLowHandicapIndex + 3.0);
    handicapIndex = currentLowHandicapIndex + 3.0 + excess * 0.5;
    handicapIndex = Math.floor(handicapIndex * 10) / 10;
  }
  // Hard cap: HI cannot exceed low HI + 5.0.
  if (currentLowHandicapIndex != null && handicapIndex > currentLowHandicapIndex + 5.0) {
    handicapIndex = currentLowHandicapIndex + 5.0;
  }
  handicapIndex = Math.min(54.0, handicapIndex);

  return {
    handicap_index: handicapIndex,
    rounds_used: rule.use,
    total_rounds: count,
    calculation_method: `${rule.use} of ${Math.min(count, 20)}`,
    differentials: used,
    low_handicap_index: lowHI,
  };
}

/** Score description relative to par (Eagle, Birdie, Par, Bogey, …). */
export function getScoreDescription(strokes: number, par: number): string {
  const diff = strokes - par;
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double Bogey";
  if (diff === 3) return "Triple Bogey";
  return `+${diff}`;
}
