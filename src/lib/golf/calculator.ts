import type { RoundDifferential, HandicapCalculation } from "@/types/golf";

// WHS table for number of differentials to use
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

/**
 * Calculate Score Differential
 * Formula: (113 / Slope Rating) x (Adjusted Gross Score - Course Rating)
 */
export function calculateDifferential(
  adjustedGrossScore: number,
  courseRating: number,
  slopeRating: number
): number {
  const differential = (113 / slopeRating) * (adjustedGrossScore - courseRating);
  return Math.round(differential * 10) / 10;
}

/**
 * Calculate Course Handicap
 * Formula: Handicap Index x (Slope Rating / 113) + (Course Rating - Par)
 */
export function calculateCourseHandicap(
  handicapIndex: number,
  slopeRating: number,
  courseRating: number,
  par: number
): number {
  const courseHandicap = handicapIndex * (slopeRating / 113) + (courseRating - par);
  return Math.round(courseHandicap);
}

/**
 * Calculate Net Double Bogey maximum score for a hole
 * Formula: Par + 2 + strokes received on hole
 */
export function calculateMaxScore(
  holePar: number,
  holeHandicapIndex: number,
  playerCourseHandicap: number
): number {
  const fullStrokes = Math.floor(playerCourseHandicap / 18);
  const remainingStrokes = playerCourseHandicap % 18;
  const extraStroke = remainingStrokes >= holeHandicapIndex ? 1 : 0;
  const strokesReceived = Math.max(0, fullStrokes + extraStroke);
  return holePar + 2 + strokesReceived;
}

/**
 * Calculate adjusted gross score (applying Net Double Bogey)
 */
export function calculateAdjustedGrossScore(
  holeScores: { strokes: number; par: number; handicap_index: number }[],
  courseHandicap: number
): number {
  let adjustedTotal = 0;
  for (const hole of holeScores) {
    const maxScore = calculateMaxScore(hole.par, hole.handicap_index, courseHandicap);
    const adjustedScore = Math.min(hole.strokes, maxScore);
    adjustedTotal += adjustedScore;
  }
  return adjustedTotal;
}

/**
 * Calculate Handicap Index from differentials
 */
export function calculateHandicapIndex(
  differentials: RoundDifferential[]
): HandicapCalculation | null {
  const count = differentials.length;
  if (count < 3) return null;

  const sorted = [...differentials].sort((a, b) => a.differential - b.differential);
  const rule = WHS_TABLE.find((r) => count >= r.min && count <= r.max);
  if (!rule) return null;

  const used = sorted.slice(0, rule.use);
  const sum = used.reduce((acc, d) => acc + d.differential, 0);
  const average = sum / rule.use;

  let handicapIndex = Math.round((average + rule.adjustment) * 10) / 10;
  handicapIndex = Math.max(0, handicapIndex);
  handicapIndex = Math.min(54.0, handicapIndex);

  const lowestDifferential = sorted[0]?.differential || 0;
  const lowHandicapIndex = Math.max(0, Math.round(lowestDifferential * 10) / 10);

  return {
    handicap_index: handicapIndex,
    rounds_used: rule.use,
    total_rounds: count,
    calculation_method: `${rule.use} of ${Math.min(count, 20)}`,
    differentials: used,
    low_handicap_index: lowHandicapIndex,
  };
}

/**
 * Get score description relative to par
 */
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

/**
 * Get CSS class for score color coding
 */
export function getScoreColorClass(strokes: number | null, par: number): string {
  if (strokes === null) return "";
  const diff = strokes - par;
  if (diff <= -2) return "text-yellow-600 bg-yellow-50";
  if (diff === -1) return "text-green-600 bg-green-50";
  if (diff === 0) return "text-gray-700 bg-gray-50";
  if (diff === 1) return "text-orange-600 bg-orange-50";
  return "text-red-600 bg-red-50";
}
