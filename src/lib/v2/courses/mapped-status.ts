/**
 * Issue #133. Mapped-status helper. A "hole" on a "tee" is fully mapped
 * when all five GPS points are set:
 *
 *   1. tee location     (per (tee, hole) — different from other tees)
 *   2. green center     (shared across tees on the same hole)
 *   3. green front      (shared)
 *   4. green back       (shared)
 *   5. ideal drive      (shared)
 *
 * The first one varies by tee; the other four are stored per-row but the
 * application writes them to every row on the same hole_number, so in
 * practice they're per-hole. This helper treats them uniformly: each (tee,
 * hole) cell has five booleans, and the rollups bubble up.
 */

export type MappedPoint =
  | "tee_location"
  | "green_center"
  | "green_front"
  | "green_back"
  | "ideal_drive";

export const MAPPED_POINT_LABELS: Record<MappedPoint, string> = {
  tee_location: "Tee location",
  green_center: "Green center",
  green_front: "Green front",
  green_back: "Green back",
  ideal_drive: "Ideal drive",
};

export const ALL_MAPPED_POINTS: MappedPoint[] = [
  "tee_location",
  "green_center",
  "green_front",
  "green_back",
  "ideal_drive",
];

export interface HoleCoordRow {
  id: string;
  tee_id: string;
  hole_number: number;
  tee_latitude: number | null;
  tee_longitude: number | null;
  green_latitude: number | null;
  green_longitude: number | null;
  green_front_latitude: number | null;
  green_front_longitude: number | null;
  green_back_latitude: number | null;
  green_back_longitude: number | null;
  drive_latitude: number | null;
  drive_longitude: number | null;
}

export interface HoleStatus {
  hole_id: string;
  tee_id: string;
  hole_number: number;
  missing: MappedPoint[];
  setCount: number;
  total: number;
  fullyMapped: boolean;
}

export function pointsForHole(row: HoleCoordRow): MappedPoint[] {
  const missing: MappedPoint[] = [];
  if (row.tee_latitude == null || row.tee_longitude == null) missing.push("tee_location");
  if (row.green_latitude == null || row.green_longitude == null) missing.push("green_center");
  if (row.green_front_latitude == null || row.green_front_longitude == null) missing.push("green_front");
  if (row.green_back_latitude == null || row.green_back_longitude == null) missing.push("green_back");
  if (row.drive_latitude == null || row.drive_longitude == null) missing.push("ideal_drive");
  return missing;
}

export function statusForHole(row: HoleCoordRow): HoleStatus {
  const missing = pointsForHole(row);
  return {
    hole_id: row.id,
    tee_id: row.tee_id,
    hole_number: row.hole_number,
    missing,
    setCount: ALL_MAPPED_POINTS.length - missing.length,
    total: ALL_MAPPED_POINTS.length,
    fullyMapped: missing.length === 0,
  };
}

export interface CourseMappedSummary {
  totalCells: number;
  setPoints: number;
  totalPoints: number;
  fullyMappedHoles: number;
  totalHoles: number;
  byTee: Map<string, { setPoints: number; totalPoints: number; fullyMappedHoles: number; totalHoles: number }>;
  byHole: HoleStatus[];
}

export function summarizeCourse(rows: HoleCoordRow[]): CourseMappedSummary {
  const byTee = new Map<string, { setPoints: number; totalPoints: number; fullyMappedHoles: number; totalHoles: number }>();
  const byHole: HoleStatus[] = [];

  let totalPoints = 0;
  let setPoints = 0;
  let fullyMappedHoles = 0;

  for (const row of rows) {
    const s = statusForHole(row);
    byHole.push(s);
    totalPoints += s.total;
    setPoints += s.setCount;
    if (s.fullyMapped) fullyMappedHoles += 1;

    const teeStats = byTee.get(row.tee_id) || { setPoints: 0, totalPoints: 0, fullyMappedHoles: 0, totalHoles: 0 };
    teeStats.setPoints += s.setCount;
    teeStats.totalPoints += s.total;
    teeStats.totalHoles += 1;
    if (s.fullyMapped) teeStats.fullyMappedHoles += 1;
    byTee.set(row.tee_id, teeStats);
  }

  return {
    totalCells: rows.length,
    setPoints,
    totalPoints,
    fullyMappedHoles,
    totalHoles: rows.length,
    byTee,
    byHole,
  };
}

/**
 * Compute the ideal-drive default position when a hole has no drive
 * coordinate stored: 250 yards from the current tee toward the green center.
 * Pure math, no DB. Returns null if tee or green coords are missing — there's
 * no fallback for "we don't know where the tee or green is."
 *
 * Uses an equirectangular approximation. Golf hole geometry never spans more
 * than ~600 yards; great-circle vs flat-earth deviation at that scale is well
 * under a meter. Plenty good for a "ghost marker" UX hint.
 */
const YARDS_PER_DEGREE_LAT = 121915.36; // 60 nautical miles per degree × 6076.12 ft/nm ÷ 3 ft/yd

export function computeIdealDriveDefault(
  teeLat: number | null,
  teeLng: number | null,
  greenLat: number | null,
  greenLng: number | null,
  yards: number = 250,
): { lat: number; lng: number } | null {
  if (teeLat == null || teeLng == null || greenLat == null || greenLng == null) return null;

  const latRad = (teeLat * Math.PI) / 180;
  const dLatYd = (greenLat - teeLat) * YARDS_PER_DEGREE_LAT;
  const dLngYd = (greenLng - teeLng) * YARDS_PER_DEGREE_LAT * Math.cos(latRad);
  const distYd = Math.hypot(dLatYd, dLngYd);
  if (distYd < 1) return null; // tee and green at same spot — degenerate

  // Don't overshoot the green: cap the default drive at 90% of tee→green
  // distance for short par 3s where 250yd would land you past the pin.
  const targetYards = Math.min(yards, distYd * 0.9);
  const fraction = targetYards / distYd;

  const driveLat = teeLat + (greenLat - teeLat) * fraction;
  const driveLng = teeLng + (greenLng - teeLng) * fraction;
  return { lat: driveLat, lng: driveLng };
}
