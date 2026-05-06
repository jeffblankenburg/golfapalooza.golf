/**
 * Lock-in tests for the KGB Cup pairing schedule generator (issue #107).
 *
 * Run with:
 *   node --experimental-strip-types scripts/test-kgb-schedule.ts
 *
 * Verifies all four supported group sizes against the rules czar's exact grids:
 *   - 1v2 (and mirror 2v1): 4 matches over 2 nine-hole halves
 *   - 2v2: 5 matches across 3 sections, scramble in §3
 *   - 2v3 (and mirror 3v2): 9 matches across 3 sections, B-player double duty
 *   - 3v3: 9 matches across 3 sections, Latin-square pairing
 */

import {
  kgbCupMatchSchedule,
  KgbScheduleError,
  type KgbPlayer,
  type KgbMatchSchedule,
} from "../src/lib/kgb-cup/schedule.ts";
import {
  computeFoursomeResult,
  type FoursomeData,
  type HoleInfo,
  type HoleScore,
} from "../src/lib/kgb-cup/match-logic.ts";

// ── Tiny test harness ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`      ${msg}`);
  }
}

function section(label: string) {
  console.log(`\n${label}`);
}

function assertEq<T>(actual: T, expected: T, what: string) {
  const a = stableStringify(actual);
  const e = stableStringify(expected);
  if (a !== e) {
    throw new Error(`${what}: expected ${e}, got ${a}`);
  }
}

function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return Object.fromEntries(
        Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return val;
  });
}

function p(id: string, displayName: string): KgbPlayer {
  return { id, displayName };
}

/**
 * Compress a schedule into a flat list of human-readable strings, one per
 * match, in section order:
 *   "§1[1-6] T1Player vs T2Player"
 * Makes diff failures dead easy to read.
 */
function flatten(schedule: KgbMatchSchedule): string[] {
  return schedule.sections.flatMap((s) =>
    s.matches.map((m) => {
      const range = `${s.holes[0]}-${s.holes[s.holes.length - 1]}`;
      const tag = s.format === "scramble" ? " SCRAMBLE" : "";
      return `§${s.section}[${range}]${tag} ${m.label}`;
    }),
  );
}

// ── Test rosters ───────────────────────────────────────────────────────────

const A1 = p("a1", "Quack");
const B1 = p("b1", "JT");
const C1 = p("c1", "Spanky");

const A2 = p("a2", "Randy");
const B2 = p("b2", "Butter");
const C2 = p("c2", "GStan");

// ── 2v2 ────────────────────────────────────────────────────────────────────

section("2v2 (existing format — 5 matches, scramble in §3)");

test("2v2: produces the canonical 5-match grid", () => {
  const sched = kgbCupMatchSchedule([A1, B1], [A2, B2]);
  assertEq(sched.groupSize, "2v2", "groupSize");
  assertEq(sched.totalMatches, 5, "totalMatches");
  assertEq(sched.totalPoints, 5, "totalPoints");
  assertEq(flatten(sched), [
    "§1[1-6] Quack vs Randy",
    "§1[1-6] JT vs Butter",
    "§2[7-12] Quack vs Butter",
    "§2[7-12] JT vs Randy",
    "§3[13-18] SCRAMBLE Quack & JT vs Randy & Butter",
  ], "schedule");
});

test("2v2: §3 is the scramble section", () => {
  const sched = kgbCupMatchSchedule([A1, B1], [A2, B2]);
  assertEq(sched.sections[2].format, "scramble", "§3 format");
  assertEq(sched.sections[0].format, "individual", "§1 format");
  assertEq(sched.sections[1].format, "individual", "§2 format");
});

// ── 1v2 ────────────────────────────────────────────────────────────────────

section("1v2 (3 players — solo plays both opponents per half)");

test("1v2: produces 4 matches over 2 halves of 9", () => {
  // From czar's grid:
  //   Holes 1-9:   A1 vs A2,  A1 vs B2
  //   Holes 10-18: A1 vs A2,  A1 vs B2
  const sched = kgbCupMatchSchedule([A1], [A2, B2]);
  assertEq(sched.groupSize, "1v2", "groupSize");
  assertEq(sched.totalMatches, 4, "totalMatches");
  assertEq(sched.totalPoints, 4, "totalPoints");
  assertEq(flatten(sched), [
    "§1[1-9] Quack vs Randy",
    "§1[1-9] Quack vs Butter",
    "§2[10-18] Quack vs Randy",
    "§2[10-18] Quack vs Butter",
  ], "schedule");
});

test("1v2: every match has the solo player on team1 side", () => {
  const sched = kgbCupMatchSchedule([A1], [A2, B2]);
  for (const s of sched.sections) {
    for (const m of s.matches) {
      assertEq(m.team1Player.id, A1.id, "team1Player");
    }
  }
});

// ── 2v1 (mirror of 1v2) ────────────────────────────────────────────────────

section("2v1 (mirror of 1v2 — solo on team2 side)");

test("2v1: solo player stays on team2 side", () => {
  const sched = kgbCupMatchSchedule([A1, B1], [A2]);
  assertEq(sched.groupSize, "2v1", "groupSize");
  assertEq(sched.totalMatches, 4, "totalMatches");
  assertEq(flatten(sched), [
    "§1[1-9] Quack vs Randy",
    "§1[1-9] JT vs Randy",
    "§2[10-18] Quack vs Randy",
    "§2[10-18] JT vs Randy",
  ], "schedule");
});

// ── 2v3 ────────────────────────────────────────────────────────────────────

section("2v3 (5 players — B-player double duty per section)");

test("2v3: matches the rules czar's exact grid", () => {
  // From czar's grid:
  //   Holes 1-6:  A1 vs A2,  B1 vs B2,  B1 vs C2
  //   Holes 7-12: A1 vs B2,  B1 vs C2,  B1 vs A2
  //   Holes 13-18:A1 vs C2,  B1 vs A2,  B1 vs B2
  const sched = kgbCupMatchSchedule([A1, B1], [A2, B2, C2]);
  assertEq(sched.groupSize, "2v3", "groupSize");
  assertEq(sched.totalMatches, 9, "totalMatches");
  assertEq(sched.totalPoints, 9, "totalPoints");
  assertEq(flatten(sched), [
    "§1[1-6] Quack vs Randy",
    "§1[1-6] JT vs Butter",
    "§1[1-6] JT vs GStan",
    "§2[7-12] Quack vs Butter",
    "§2[7-12] JT vs GStan",
    "§2[7-12] JT vs Randy",
    "§3[13-18] Quack vs GStan",
    "§3[13-18] JT vs Randy",
    "§3[13-18] JT vs Butter",
  ], "schedule");
});

test("2v3: B-player plays exactly 2 matches per section, A-player plays 1", () => {
  const sched = kgbCupMatchSchedule([A1, B1], [A2, B2, C2]);
  for (const s of sched.sections) {
    const a1Matches = s.matches.filter((m) => m.team1Player.id === A1.id).length;
    const b1Matches = s.matches.filter((m) => m.team1Player.id === B1.id).length;
    assertEq(a1Matches, 1, `§${s.section} A1 match count`);
    assertEq(b1Matches, 2, `§${s.section} B1 match count`);
  }
});

test("2v3: each opponent appears exactly twice in B1's matches across the round", () => {
  const sched = kgbCupMatchSchedule([A1, B1], [A2, B2, C2]);
  const b1Opponents: Record<string, number> = {};
  for (const s of sched.sections) {
    for (const m of s.matches) {
      if (m.team1Player.id === B1.id) {
        b1Opponents[m.team2Player.id] = (b1Opponents[m.team2Player.id] || 0) + 1;
      }
    }
  }
  assertEq(b1Opponents, { [A2.id]: 2, [B2.id]: 2, [C2.id]: 2 }, "B1 opponent counts");
});

test("2v3: A1 plays each opponent exactly once across the round", () => {
  const sched = kgbCupMatchSchedule([A1, B1], [A2, B2, C2]);
  const a1Opponents: Record<string, number> = {};
  for (const s of sched.sections) {
    for (const m of s.matches) {
      if (m.team1Player.id === A1.id) {
        a1Opponents[m.team2Player.id] = (a1Opponents[m.team2Player.id] || 0) + 1;
      }
    }
  }
  assertEq(a1Opponents, { [A2.id]: 1, [B2.id]: 1, [C2.id]: 1 }, "A1 opponent counts");
});

// ── 3v2 (mirror of 2v3) ────────────────────────────────────────────────────

section("3v2 (mirror of 2v3 — bigger team on team1 side)");

test("3v2: smaller team's B-player still plays double duty", () => {
  const sched = kgbCupMatchSchedule([A1, B1, C1], [A2, B2]);
  assertEq(sched.groupSize, "3v2", "groupSize");
  assertEq(sched.totalMatches, 9, "totalMatches");

  // Smaller team is team2 (A2, B2). B2 should appear in 2 matches per section.
  for (const s of sched.sections) {
    const a2Matches = s.matches.filter((m) => m.team2Player.id === A2.id).length;
    const b2Matches = s.matches.filter((m) => m.team2Player.id === B2.id).length;
    assertEq(a2Matches, 1, `§${s.section} A2 match count`);
    assertEq(b2Matches, 2, `§${s.section} B2 match count`);
  }
});

// ── 3v3 ────────────────────────────────────────────────────────────────────

section("3v3 (6 players — Latin square, each pair plays once)");

test("3v3: produces the Latin-square schedule", () => {
  const sched = kgbCupMatchSchedule([A1, B1, C1], [A2, B2, C2]);
  assertEq(sched.groupSize, "3v3", "groupSize");
  assertEq(sched.totalMatches, 9, "totalMatches");
  assertEq(sched.totalPoints, 9, "totalPoints");
  assertEq(flatten(sched), [
    "§1[1-6] Quack vs Randy",
    "§1[1-6] JT vs Butter",
    "§1[1-6] Spanky vs GStan",
    "§2[7-12] Quack vs Butter",
    "§2[7-12] JT vs GStan",
    "§2[7-12] Spanky vs Randy",
    "§3[13-18] Quack vs GStan",
    "§3[13-18] JT vs Randy",
    "§3[13-18] Spanky vs Butter",
  ], "schedule");
});

test("3v3: every player plays each opponent exactly once", () => {
  const sched = kgbCupMatchSchedule([A1, B1, C1], [A2, B2, C2]);
  const counts: Record<string, number> = {};
  for (const s of sched.sections) {
    for (const m of s.matches) {
      const key = `${m.team1Player.id}-${m.team2Player.id}`;
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  // Should have exactly 9 keys, each with count 1
  const keys = Object.keys(counts);
  if (keys.length !== 9) throw new Error(`expected 9 unique pairings, got ${keys.length}`);
  for (const [k, c] of Object.entries(counts)) {
    if (c !== 1) throw new Error(`pairing ${k} appeared ${c} times`);
  }
});

test("3v3: each player plays exactly one match per section", () => {
  const sched = kgbCupMatchSchedule([A1, B1, C1], [A2, B2, C2]);
  for (const s of sched.sections) {
    for (const player of [A1, B1, C1, A2, B2, C2]) {
      const matches = s.matches.filter(
        (m) => m.team1Player.id === player.id || m.team2Player.id === player.id,
      );
      assertEq(matches.length, 1, `§${s.section} ${player.displayName} match count`);
    }
  }
});

// ── Unsupported sizes ──────────────────────────────────────────────────────

section("Unsupported group sizes (should throw)");

test("1v1 throws (use 3v3 instead per czar)", () => {
  let threw = false;
  try {
    kgbCupMatchSchedule([A1], [A2]);
  } catch (e) {
    threw = e instanceof KgbScheduleError;
  }
  if (!threw) throw new Error("expected KgbScheduleError");
});

test("1v3 throws", () => {
  let threw = false;
  try {
    kgbCupMatchSchedule([A1], [A2, B2, C2]);
  } catch (e) {
    threw = e instanceof KgbScheduleError;
  }
  if (!threw) throw new Error("expected KgbScheduleError");
});

test("4v4 throws", () => {
  let threw = false;
  try {
    kgbCupMatchSchedule(
      [A1, B1, C1, p("d1", "X")],
      [A2, B2, C2, p("d2", "Y")],
    );
  } catch (e) {
    threw = e instanceof KgbScheduleError;
  }
  if (!threw) throw new Error("expected KgbScheduleError");
});

// ── Match indices are stable & sequential ──────────────────────────────────

section("Match indices");

test("matchIndex is sequential across all sections", () => {
  const sched = kgbCupMatchSchedule([A1, B1, C1], [A2, B2, C2]);
  let expected = 0;
  for (const s of sched.sections) {
    for (const m of s.matches) {
      assertEq(m.matchIndex, expected, `match #${expected}`);
      expected++;
    }
  }
});

// ── computeFoursomeResult integration ──────────────────────────────────────

section("computeFoursomeResult shape");

const standardHoles: HoleInfo[] = Array.from({ length: 18 }, (_, i) => ({
  hole_number: i + 1,
  par: 4,
  handicap_index: i + 1,
}));

function makeFoursome(t1: KgbPlayer[], t2: KgbPlayer[]): FoursomeData {
  return {
    id: "foursome-1",
    pair_team1_id: "pair-1",
    pair_team2_id: "pair-2",
    team1_player_a_id: t1[0]?.id ?? null,
    team1_player_b_id: t1[1]?.id ?? null,
    team1_player_c_id: t1[2]?.id ?? null,
    team2_player_a_id: t2[0]?.id ?? null,
    team2_player_b_id: t2[1]?.id ?? null,
    team2_player_c_id: t2[2]?.id ?? null,
  };
}

test("2v2: produces 5 matches (4 individual + scramble §3)", () => {
  const result = computeFoursomeResult(
    makeFoursome([A1, B1], [A2, B2]),
    [],
    new Map(),
    new Map(),
    standardHoles,
    new Map([[A1.id, "Quack"], [B1.id, "JT"], [A2.id, "Randy"], [B2.id, "Butter"]]),
  );
  assertEq(result.matches.length, 5, "match count");
  assertEq(result.matches[4].scorerType, "pair", "§3 is scramble");
  assertEq(result.matches[0].scorerType, "player", "§1 match 1 is individual");
});

test("1v2: produces 4 individual matches", () => {
  const result = computeFoursomeResult(
    makeFoursome([A1], [A2, B2]),
    [],
    new Map(),
    new Map(),
    standardHoles,
    new Map([[A1.id, "Quack"], [A2.id, "Randy"], [B2.id, "Butter"]]),
  );
  assertEq(result.matches.length, 4, "match count");
  for (const m of result.matches) assertEq(m.scorerType, "player", "every match is individual");
});

test("2v3: produces 9 individual matches", () => {
  const result = computeFoursomeResult(
    makeFoursome([A1, B1], [A2, B2, C2]),
    [],
    new Map(),
    new Map(),
    standardHoles,
    new Map([[A1.id, "Quack"], [B1.id, "JT"], [A2.id, "Randy"], [B2.id, "Butter"], [C2.id, "GStan"]]),
  );
  assertEq(result.matches.length, 9, "match count");
  for (const m of result.matches) assertEq(m.scorerType, "player", "every match is individual");
});

test("3v3: produces 9 individual matches", () => {
  const result = computeFoursomeResult(
    makeFoursome([A1, B1, C1], [A2, B2, C2]),
    [],
    new Map(),
    new Map(),
    standardHoles,
    new Map([[A1.id, "Quack"], [B1.id, "JT"], [C1.id, "Spanky"], [A2.id, "Randy"], [B2.id, "Butter"], [C2.id, "GStan"]]),
  );
  assertEq(result.matches.length, 9, "match count");
});

test("2v3: B-player double-duty — one ball, two matches", () => {
  // JT (B1) scores 4 on hole 1. He plays B2 (Butter) and C2 (GStan) in §1.
  // His single score should drive the result of both matches.
  // Butter scores 5 on hole 1, GStan scores 3.
  // → JT vs Butter: JT (4) beats Butter (5) → team1 wins
  // → JT vs GStan: JT (4) loses to GStan (3) → team2 wins
  const scores: HoleScore[] = [
    { foursome_id: "foursome-1", hole_number: 1, scorer_type: "player", scorer_id: A1.id, strokes: 5 },
    { foursome_id: "foursome-1", hole_number: 1, scorer_type: "player", scorer_id: B1.id, strokes: 4 },
    { foursome_id: "foursome-1", hole_number: 1, scorer_type: "player", scorer_id: A2.id, strokes: 6 },
    { foursome_id: "foursome-1", hole_number: 1, scorer_type: "player", scorer_id: B2.id, strokes: 5 },
    { foursome_id: "foursome-1", hole_number: 1, scorer_type: "player", scorer_id: C2.id, strokes: 3 },
  ];
  const result = computeFoursomeResult(
    makeFoursome([A1, B1], [A2, B2, C2]),
    scores,
    new Map(),
    new Map(),
    standardHoles,
    new Map([[A1.id, "Quack"], [B1.id, "JT"], [A2.id, "Randy"], [B2.id, "Butter"], [C2.id, "GStan"]]),
  );
  // §1 matches in czar's grid: A1-A2, B1-B2, B1-C2
  const sec1 = result.matches.filter((m) => m.section === 1);
  assertEq(sec1.length, 3, "§1 match count");
  const jtVsButter = sec1.find((m) => m.team1ScorerId === B1.id && m.team2ScorerId === B2.id)!;
  const jtVsGStan = sec1.find((m) => m.team1ScorerId === B1.id && m.team2ScorerId === C2.id)!;
  assertEq(jtVsButter.holeResults[0].winner, "team1", "JT(4) beats Butter(5)");
  assertEq(jtVsGStan.holeResults[0].winner, "team2", "GStan(3) beats JT(4)");
});

test("Unsupported size returns empty matches (doesn't throw)", () => {
  // 4v4 — unsupported, computeFoursomeResult should return empty rather than throw.
  const result = computeFoursomeResult(
    {
      id: "foursome-1",
      pair_team1_id: "pair-1",
      pair_team2_id: "pair-2",
      team1_player_a_id: A1.id,
      team1_player_b_id: B1.id,
      team1_player_c_id: C1.id,
      team2_player_a_id: A2.id,
      team2_player_b_id: B2.id,
      team2_player_c_id: C2.id,
    },
    [],
    new Map(),
    new Map(),
    standardHoles,
  );
  // 3v3 is supported, but if either side were 4 we'd return empty.
  // Here we have 3v3, so this returns 9 matches — which is supported. Good.
  assertEq(result.matches.length, 9, "3v3 still works through compute");
});

test("Empty side returns empty matches", () => {
  const result = computeFoursomeResult(
    makeFoursome([A1], []),
    [],
    new Map(),
    new Map(),
    standardHoles,
  );
  assertEq(result.matches.length, 0, "no matches when one side empty");
});

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
