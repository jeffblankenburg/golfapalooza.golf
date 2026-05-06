/**
 * KGB Cup pairing schedule generator.
 *
 * Pure function — given the two team rosters, returns the canonical match list
 * per section. Single source of truth for the admin UI, scoring engine, and
 * leaderboard.
 *
 * Supported group sizes (issue #107):
 *   2v2  →  3 sections (6+6+6), 5 matches  (4 individual + 1 scramble in §3)
 *   1v2  →  2 halves (9+9),     4 matches  (solo plays both opponents per half)
 *   2v3  →  3 sections (6+6+6), 9 matches  (smaller team's B-player double-duty)
 *   3v3  →  3 sections (6+6+6), 9 matches  (Latin square, each pair once)
 *
 * 2v1 and 3v2 are handled by detecting which team is smaller; the schedule is
 * generated as if the smaller team is "team1" internally, then the team1/team2
 * orientation in the returned matches matches the input.
 *
 * Intentionally NOT supported: 1v1, 1v3, 3v1, and any 4+ on a side.
 */

export interface KgbPlayer {
  id: string;
  displayName: string;
}

export type KgbGroupSize = "2v2" | "1v2" | "2v1" | "2v3" | "3v2" | "3v3";

export type KgbSectionFormat = "individual" | "scramble";

export interface KgbScheduledMatch {
  /** Stable 0-based index within the schedule (across all sections). */
  matchIndex: number;
  team1Player: KgbPlayer;
  team2Player: KgbPlayer;
  /** Human-readable label, e.g. "JT vs Randy". */
  label: string;
}

export interface KgbScheduledSection {
  section: 1 | 2 | 3;
  holes: number[];
  format: KgbSectionFormat;
  matches: KgbScheduledMatch[];
}

export interface KgbMatchSchedule {
  groupSize: KgbGroupSize;
  team1: KgbPlayer[];
  team2: KgbPlayer[];
  sections: KgbScheduledSection[];
  totalMatches: number;
  /** One point per individual match; scramble section worth 1 point in 2v2. */
  totalPoints: number;
}

export class KgbScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KgbScheduleError";
  }
}

/**
 * Build the match schedule for a KGB Cup group.
 * Throws KgbScheduleError for unsupported team sizes.
 */
export function kgbCupMatchSchedule(
  team1: KgbPlayer[],
  team2: KgbPlayer[],
): KgbMatchSchedule {
  const groupSize = classify(team1.length, team2.length);

  switch (groupSize) {
    case "2v2":
      return build2v2(team1, team2);
    case "1v2":
    case "2v1":
      return buildLopsidedHalves(team1, team2, groupSize);
    case "2v3":
    case "3v2":
      return buildLopsidedSections(team1, team2, groupSize);
    case "3v3":
      return build3v3(team1, team2);
  }
}

function classify(t1: number, t2: number): KgbGroupSize {
  if (t1 === 2 && t2 === 2) return "2v2";
  if (t1 === 1 && t2 === 2) return "1v2";
  if (t1 === 2 && t2 === 1) return "2v1";
  if (t1 === 2 && t2 === 3) return "2v3";
  if (t1 === 3 && t2 === 2) return "3v2";
  if (t1 === 3 && t2 === 3) return "3v3";
  throw new KgbScheduleError(
    `Unsupported KGB Cup group size: ${t1}v${t2}. Supported: 2v2, 1v2, 2v1, 2v3, 3v2, 3v3.`,
  );
}

const RANGE_1_TO_6 = [1, 2, 3, 4, 5, 6];
const RANGE_7_TO_12 = [7, 8, 9, 10, 11, 12];
const RANGE_13_TO_18 = [13, 14, 15, 16, 17, 18];
const RANGE_1_TO_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const RANGE_10_TO_18 = [10, 11, 12, 13, 14, 15, 16, 17, 18];

function pairLabel(t1: KgbPlayer, t2: KgbPlayer): string {
  return `${t1.displayName} vs ${t2.displayName}`;
}

/**
 * 2v2 — the existing format. Two 6-hole individual sections then a scramble.
 *   §1 (1-6):   T1[0] vs T2[0],  T1[1] vs T2[1]
 *   §2 (7-12):  T1[0] vs T2[1],  T1[1] vs T2[0]
 *   §3 (13-18): T1 pair scramble vs T2 pair scramble
 */
function build2v2(t1: KgbPlayer[], t2: KgbPlayer[]): KgbMatchSchedule {
  let idx = 0;
  const next = () => idx++;

  const sections: KgbScheduledSection[] = [
    {
      section: 1,
      holes: RANGE_1_TO_6,
      format: "individual",
      matches: [
        match(next(), t1[0], t2[0]),
        match(next(), t1[1], t2[1]),
      ],
    },
    {
      section: 2,
      holes: RANGE_7_TO_12,
      format: "individual",
      matches: [
        match(next(), t1[0], t2[1]),
        match(next(), t1[1], t2[0]),
      ],
    },
    {
      section: 3,
      holes: RANGE_13_TO_18,
      format: "scramble",
      // The scramble pits the whole pair vs whole pair — we still surface a
      // single "match" row whose label names both pairs. Scoring engine knows
      // to read pair scores instead of individual scores.
      matches: [
        {
          matchIndex: next(),
          team1Player: t1[0], // representative; scramble uses pair scores
          team2Player: t2[0],
          label: `${t1.map((p) => p.displayName).join(" & ")} vs ${t2.map((p) => p.displayName).join(" & ")}`,
        },
      ],
    },
  ];

  return {
    groupSize: "2v2",
    team1: t1,
    team2: t2,
    sections,
    totalMatches: 5,
    totalPoints: 5,
  };
}

/**
 * 1v2 / 2v1 — two 9-hole halves, the solo player plays both opponents in each
 * half. 4 individual matches, 4 points.
 *
 * Per the rules czar's grid (§2 just lists opponents in reverse order, but the
 * matchups are identical), we emit them in the same canonical order in both
 * halves: solo-vs-A, then solo-vs-B.
 */
function buildLopsidedHalves(
  t1: KgbPlayer[],
  t2: KgbPlayer[],
  groupSize: "1v2" | "2v1",
): KgbMatchSchedule {
  const soloIsTeam1 = groupSize === "1v2";
  const solo = soloIsTeam1 ? t1[0] : t2[0];
  const pair = soloIsTeam1 ? t2 : t1;

  let idx = 0;
  const next = () => idx++;

  const matchFor = (opponent: KgbPlayer): KgbScheduledMatch => {
    return soloIsTeam1
      ? match(next(), solo, opponent)
      : match(next(), opponent, solo);
  };

  const sections: KgbScheduledSection[] = [
    {
      section: 1,
      holes: RANGE_1_TO_9,
      format: "individual",
      matches: [matchFor(pair[0]), matchFor(pair[1])],
    },
    {
      section: 2,
      holes: RANGE_10_TO_18,
      format: "individual",
      matches: [matchFor(pair[0]), matchFor(pair[1])],
    },
  ];

  return {
    groupSize,
    team1: t1,
    team2: t2,
    sections,
    totalMatches: 4,
    totalPoints: 4,
  };
}

/**
 * 2v3 / 3v2 — three 6-hole sections, each with 3 simultaneous individual
 * matches. The smaller team's B-player plays double duty (two matches per
 * section, single ball, score counts in both).
 *
 * Algorithm (smaller team referred to as "small", bigger as "big"):
 *   For each section s in {0,1,2}:
 *     small[0] vs big[(0 + s) % 3]   // A-player rotates through each opponent once over the full match
 *     small[1] vs big[(1 + s) % 3]   // B-player half of the rotation
 *     small[1] vs big[(2 + s) % 3]   // B-player double-duty: takes the remaining big-team player this section
 *
 *   This guarantees small[0] (A) plays each big-team player exactly once, and
 *   small[1] (B) plays each big-team player exactly twice — matching the
 *   czar's grid for §1/§2/§3.
 */
function buildLopsidedSections(
  t1: KgbPlayer[],
  t2: KgbPlayer[],
  groupSize: "2v3" | "3v2",
): KgbMatchSchedule {
  const smallIsTeam1 = groupSize === "2v3";
  const small = smallIsTeam1 ? t1 : t2;
  const big = smallIsTeam1 ? t2 : t1;

  let idx = 0;
  const next = () => idx++;

  const matchFor = (smallPlayer: KgbPlayer, bigPlayer: KgbPlayer): KgbScheduledMatch => {
    return smallIsTeam1
      ? match(next(), smallPlayer, bigPlayer)
      : match(next(), bigPlayer, smallPlayer);
  };

  const sectionRanges: { section: 1 | 2 | 3; holes: number[] }[] = [
    { section: 1, holes: RANGE_1_TO_6 },
    { section: 2, holes: RANGE_7_TO_12 },
    { section: 3, holes: RANGE_13_TO_18 },
  ];

  const sections: KgbScheduledSection[] = sectionRanges.map(({ section, holes }, s) => ({
    section,
    holes,
    format: "individual",
    matches: [
      matchFor(small[0], big[(0 + s) % 3]),
      matchFor(small[1], big[(1 + s) % 3]),
      matchFor(small[1], big[(2 + s) % 3]),
    ],
  }));

  return {
    groupSize,
    team1: t1,
    team2: t2,
    sections,
    totalMatches: 9,
    totalPoints: 9,
  };
}

/**
 * 3v3 — Latin square. Each player plays each opposing player exactly once
 * over the 18 holes.
 *   §1: T1[i] vs T2[i]           (i = 0..2)
 *   §2: T1[i] vs T2[(i+1) % 3]
 *   §3: T1[i] vs T2[(i+2) % 3]
 */
function build3v3(t1: KgbPlayer[], t2: KgbPlayer[]): KgbMatchSchedule {
  let idx = 0;
  const next = () => idx++;

  const sectionRanges: { section: 1 | 2 | 3; holes: number[] }[] = [
    { section: 1, holes: RANGE_1_TO_6 },
    { section: 2, holes: RANGE_7_TO_12 },
    { section: 3, holes: RANGE_13_TO_18 },
  ];

  const sections: KgbScheduledSection[] = sectionRanges.map(({ section, holes }, s) => ({
    section,
    holes,
    format: "individual",
    matches: [0, 1, 2].map((i) => match(next(), t1[i], t2[(i + s) % 3])),
  }));

  return {
    groupSize: "3v3",
    team1: t1,
    team2: t2,
    sections,
    totalMatches: 9,
    totalPoints: 9,
  };
}

function match(matchIndex: number, t1: KgbPlayer, t2: KgbPlayer): KgbScheduledMatch {
  return {
    matchIndex,
    team1Player: t1,
    team2Player: t2,
    label: pairLabel(t1, t2),
  };
}
