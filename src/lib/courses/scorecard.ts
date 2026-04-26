// Canonical scorecard shape used by /api/courses/lookup. Both GolfCourseAPI
// responses and AI extractions get normalized into this before persistence,
// so the rest of the cascade only knows one format.

import type { GcApiCourse } from "@/lib/golf-course-api/types";

export type Confidence = "high" | "medium" | "low";

export interface NormalizedHole {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}

export interface NormalizedTee {
  tee_name: string;
  tee_color: string | null;
  gender: "men" | "women" | "all";
  course_rating: number | null;
  slope_rating: number | null;
  total_yards: number | null;
  par: number;
  holes: NormalizedHole[];
}

export interface NormalizedScorecard {
  source: "gcapi" | "ai";
  confidence: Confidence;
  external_id: string | null;             // gcapi numeric id (as string) when source=gcapi
  course: {
    name: string;
    club_name: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
    website: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  hole_count: 9 | 18;
  tees: NormalizedTee[];
  source_urls: string[];
  notes: string | null;
}

/**
 * Build the dedup key. The cascade looks this up before calling GCAPI/AI;
 * GCAPI/AI rows are upserted with the same key so a second user converges
 * on the same row. Stable across whitespace, case, and "Golf Club" suffix
 * variations that don't usefully distinguish two courses.
 */
export function buildLookupKey(name: string, state: string, city?: string | null): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\b(golf club|golf course|golf links|country club|cc|gc|the)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  const parts = [norm(name), state.trim().toUpperCase()];
  if (city) parts.push(norm(city));
  return parts.join("|");
}

// Order matters: more-specific names go first so e.g. "Burgundy" doesn't match "red".
const TEE_COLOR_HINTS: Array<[string, string]> = [
  ["burgundy", "burgundy"],
  ["copper", "copper"],
  ["bronze", "bronze"],
  ["orange", "orange"],
  ["purple", "purple"],
  ["yellow", "yellow"],
  ["navy", "navy"],
  ["teal", "teal"],
  ["brown", "brown"],
  ["pink", "pink"],
  ["silver", "silver"],
  ["black", "black"],
  ["blue", "blue"],
  ["white", "white"],
  ["gold", "gold"],
  ["green", "green"],
  ["red", "red"],
  // Fallback aliases — heuristics for tour/championship branding.
  ["championship", "black"],
  ["tournament", "black"],
  ["tips", "black"],
  ["masters", "green"],
  ["players", "blue"],
];

function inferTeeColor(teeName: string): string | null {
  const lower = teeName.toLowerCase();
  for (const [hint, color] of TEE_COLOR_HINTS) {
    if (lower.includes(hint)) return color;
  }
  return null;
}

/**
 * Strip city/state/zip suffix from a free-form address string.
 *
 * GCAPI and AI sources frequently return the full mailing address
 * ("1448 Norwood Hills Dr, St. Louis, MO 63138"), but we store city and
 * state in their own columns. The street-address column should only hold
 * the first comma-separated segment.
 */
function streetAddressOnly(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const first = addr.split(",")[0]?.trim();
  return first || null;
}

function inferGender(teeName: string): "men" | "women" | "all" {
  const l = teeName.toLowerCase();
  if (l.includes("women") || l.includes("ladies") || l.includes("forward")) return "women";
  if (l.includes("men") || l.includes("senior") || l.includes("championship")) return "men";
  return "all";
}

/** GolfCourseAPI → canonical. Drops tees that don't have full per-hole data. */
export function normalizeFromGcApi(course: GcApiCourse): NormalizedScorecard | null {
  const allTees = [
    ...(course.tees?.male || []).map(t => ({ tee: t, gender: "men" as const })),
    ...(course.tees?.female || []).map(t => ({ tee: t, gender: "women" as const })),
  ];
  // Drop tees that don't have full per-hole data — incomplete tees are
  // worse than missing tees because they show up in the UI as broken.
  const tees: NormalizedTee[] = allTees
    .filter(({ tee }) => tee.holes && tee.holes.length === tee.number_of_holes && tee.number_of_holes > 0)
    .map(({ tee, gender }) => ({
      tee_name: tee.tee_name,
      tee_color: inferTeeColor(tee.tee_name),
      gender,
      course_rating: tee.course_rating > 0 ? tee.course_rating : null,
      slope_rating: tee.slope_rating > 0 ? tee.slope_rating : null,
      total_yards: tee.total_yards > 0 ? tee.total_yards : null,
      par: tee.par_total,
      holes: tee.holes.map((h, i) => ({
        hole_number: i + 1,
        par: h.par,
        handicap_index: h.handicap,
        yards: h.yardage > 0 ? h.yardage : null,
      })),
    }));

  if (tees.length === 0) return null;

  const holeCount = tees[0].holes.length;
  if (holeCount !== 9 && holeCount !== 18) return null;

  return {
    source: "gcapi",
    confidence: "high",
    external_id: String(course.id),
    course: {
      name: course.course_name || course.club_name,
      club_name: course.club_name || null,
      city: course.location?.city || null,
      state: course.location?.state || null,
      address: streetAddressOnly(course.location?.address),
      website: null,
      latitude: course.location?.latitude ?? null,
      longitude: course.location?.longitude ?? null,
    },
    hole_count: holeCount,
    tees,
    source_urls: [`https://golfcourseapi.com/courses/${course.id}`],
    notes: null,
  };
}

/**
 * Validate an AI response and convert it to canonical form.
 * Returns the normalized payload + any per-tee warnings, or `null` with the
 * fatal validation error if the payload is unusable.
 */
export function normalizeFromAi(payload: unknown): {
  normalized: NormalizedScorecard | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const v = (cond: boolean, msg: string) => { if (!cond) errors.push(msg); };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as any;

  if (!p || typeof p !== "object") {
    return { normalized: null, errors: ["payload not an object"], warnings };
  }
  v(typeof p.course?.name === "string" && p.course.name.length > 0, "course.name missing");
  v(typeof p.course?.state === "string" && p.course.state.length > 0, "course.state missing");
  v([9, 18].includes(p.hole_count), "hole_count must be 9 or 18");
  v(["high", "medium", "low"].includes(p.confidence), "confidence invalid");

  if (errors.length) return { normalized: null, errors, warnings };

  if (p.confidence === "low" || !Array.isArray(p.tees) || p.tees.length === 0) {
    // Treat low-confidence / empty as a fallthrough — caller falls back to manual.
    return { normalized: null, errors: ["low confidence or no tees"], warnings };
  }

  const tees: NormalizedTee[] = [];
  for (const [i, raw] of p.tees.entries()) {
    const ctx = `tees[${i}](${raw?.tee_name || "?"})`;
    const teeErrors: string[] = [];

    if (!raw?.tee_name) { teeErrors.push(`${ctx}.tee_name missing`); continue; }
    if (typeof raw.par !== "number" || raw.par < 60 || raw.par > 80) {
      teeErrors.push(`${ctx}.par out of range`);
    }
    if (raw.course_rating != null && (typeof raw.course_rating !== "number" ||
        raw.course_rating < 55 || raw.course_rating > 90)) {
      teeErrors.push(`${ctx}.course_rating out of range`);
    }
    if (raw.slope_rating != null && (!Number.isInteger(raw.slope_rating) ||
        raw.slope_rating < 55 || raw.slope_rating > 155)) {
      teeErrors.push(`${ctx}.slope_rating out of range`);
    }
    if (!Array.isArray(raw.holes) || raw.holes.length !== p.hole_count) {
      teeErrors.push(`${ctx}.holes length mismatch`);
    }

    if (teeErrors.length) { warnings.push(...teeErrors); continue; }

    const handicaps = new Set<number>();
    let parSum = 0;
    let holeOk = true;
    const holes: NormalizedHole[] = [];
    for (const [j, h] of raw.holes.entries()) {
      if (h.hole_number !== j + 1 || typeof h.par !== "number" || h.par < 3 || h.par > 6 ||
          typeof h.handicap_index !== "number" || h.handicap_index < 1 || h.handicap_index > p.hole_count) {
        warnings.push(`${ctx}.holes[${j + 1}] invalid; dropping tee`);
        holeOk = false;
        break;
      }
      handicaps.add(h.handicap_index);
      parSum += h.par;
      holes.push({
        hole_number: h.hole_number,
        par: h.par,
        handicap_index: h.handicap_index,
        yards: typeof h.yards === "number" && h.yards > 0 ? h.yards : null,
      });
    }
    if (!holeOk) continue;
    if (handicaps.size !== p.hole_count) {
      warnings.push(`${ctx} handicap_index not unique; dropping`);
      continue;
    }
    if (parSum !== raw.par) {
      warnings.push(`${ctx} hole pars sum ${parSum} != tee par ${raw.par}; correcting tee.par`);
    }

    tees.push({
      tee_name: raw.tee_name,
      tee_color: typeof raw.tee_color === "string" ? raw.tee_color.toLowerCase() : inferTeeColor(raw.tee_name),
      gender: ["men", "women", "all"].includes(raw.gender) ? raw.gender : inferGender(raw.tee_name),
      course_rating: raw.course_rating ?? null,
      slope_rating: raw.slope_rating ?? null,
      total_yards: typeof raw.total_yards === "number" && raw.total_yards > 0 ? raw.total_yards : null,
      par: parSum,
      holes,
    });
  }

  if (tees.length === 0) {
    return { normalized: null, errors: ["no tees survived validation"], warnings };
  }

  const normalized: NormalizedScorecard = {
    source: "ai",
    confidence: p.confidence,
    external_id: null,
    course: {
      name: p.course.name,
      club_name: p.course.club_name || null,
      city: p.course.city || null,
      state: p.course.state,
      address: streetAddressOnly(p.course.address),
      website: p.course.website || null,
      latitude: null,
      longitude: null,
    },
    hole_count: p.hole_count,
    tees,
    source_urls: Array.isArray(p.source_urls) ? p.source_urls.filter((s: unknown) => typeof s === "string") : [],
    notes: typeof p.notes === "string" ? p.notes : null,
  };

  return { normalized, errors: [], warnings };
}
