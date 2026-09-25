/**
 * 6-6-6 / Round Robin (#183): a foursome splits 18 holes into three 6-hole
 * better-ball match-play segments with ROTATING partners, so each player
 * partners each of the other three once:
 *   Holes 1-6:   P1+P2 vs P3+P4
 *   Holes 7-12:  P1+P3 vs P2+P4
 *   Holes 13-18: P1+P4 vs P2+P3
 * Each segment is its own match: the team's low ball wins the hole, ties halve,
 * and a segment closes out when a lead exceeds the holes remaining (e.g. 3&2).
 * Exactly four players, 18 holes. Pure — derived from per-hole scores (gross/net).
 */

export interface SixesSegment {
  key: "s1" | "s2" | "s3";
  label: string;
  teamA: [string, string]; // round_player_ids
  teamB: [string, string];
  up: number; // holes the leading team is up (0 = all square)
  leader: "A" | "B" | null;
  remaining: number; // holes left in the segment (at closeout, holes that were left)
  complete: boolean;
  decided: boolean;
  closeout: boolean;
  dormie: boolean;
}
export interface SixesResult {
  segments: SixesSegment[];
}

export function computeSixSixSix(
  holeNumbers: number[],
  scores: Record<string, Record<number, number>>,
  players: string[], // exactly four, in seating order
): SixesResult {
  const [p0, p1, p2, p3] = players;
  const defs: { key: SixesSegment["key"]; label: string; lo: number; hi: number; a: [string, string]; b: [string, string] }[] = [
    { key: "s1", label: "Holes 1–6", lo: 1, hi: 6, a: [p0, p1], b: [p2, p3] },
    { key: "s2", label: "Holes 7–12", lo: 7, hi: 12, a: [p0, p2], b: [p1, p3] },
    { key: "s3", label: "Holes 13–18", lo: 13, hi: 18, a: [p0, p3], b: [p1, p2] },
  ];

  const segments = defs.map((def): SixesSegment => {
    const holes = holeNumbers.filter((h) => h >= def.lo && h <= def.hi).sort((x, y) => x - y);
    const segLen = holes.length;
    let diff = 0; // + = team A ahead
    let played = 0;
    let closeoutRemaining: number | null = null;

    for (const h of holes) {
      const aScores = def.a.map((id) => scores[id]?.[h]).filter((v): v is number => v != null);
      const bScores = def.b.map((id) => scores[id]?.[h]).filter((v): v is number => v != null);
      if (aScores.length === 0 || bScores.length === 0) continue; // need a ball from each team
      const aBest = Math.min(...aScores);
      const bBest = Math.min(...bScores);
      if (aBest < bBest) diff += 1;
      else if (bBest < aBest) diff -= 1;
      played += 1;
      const remaining = segLen - played;
      if (Math.abs(diff) > remaining) {
        closeoutRemaining = remaining;
        break;
      }
    }

    const up = Math.abs(diff);
    const leader = diff === 0 ? null : diff > 0 ? "A" : "B";
    const complete = played === segLen;
    const remaining = closeoutRemaining ?? segLen - played;
    const closeout = closeoutRemaining !== null;
    const decided = closeout || complete;
    const dormie = !decided && up > 0 && up === remaining;

    return { key: def.key, label: def.label, teamA: def.a, teamB: def.b, up, leader, remaining, complete, decided, closeout, dormie };
  });

  return { segments };
}

/**
 * Per-player net units for a valued 6-6-6: each segment, the winning team's two
 * players each collect one unit and the losing team's two each pay one; halved
 * segments pay nothing. Sums to zero across the four players.
 */
export function sixesNetUnits(result: SixesResult, players: string[]): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  for (const s of result.segments) {
    if (!s.leader) continue;
    const winners = s.leader === "A" ? s.teamA : s.teamB;
    const losers = s.leader === "A" ? s.teamB : s.teamA;
    for (const id of winners) net[id] = (net[id] ?? 0) + 1;
    for (const id of losers) net[id] = (net[id] ?? 0) - 1;
  }
  return net;
}
