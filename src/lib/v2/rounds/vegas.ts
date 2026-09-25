/**
 * Vegas / Daytona (#183): a 2-v-2 team game. Each hole a team's two scores form a
 * number with the LOW score first (4 & 5 → 45); the lower team number wins the
 * hole and the running total is the point difference. Fixed teams (first two
 * players vs last two).
 *
 * The birdie twist ("the flip"): when the OPPOSING team makes a birdie or better
 * on a hole, YOUR number flips to high-first (4 & 5 → 54), ballooning it. Net
 * games use the net score for both the number and the birdie test. Pure — derived
 * from per-hole scores + par.
 */

export interface VegasHole {
  hole: number;
  aScores: [number, number];
  bScores: [number, number];
  aNum: number;
  bNum: number;
  aFlip: boolean; // team A's number was flipped (team B birdied)
  bFlip: boolean; // team B's number was flipped (team A birdied)
  diff: number; // points that hole swung to the leader (|aNum - bNum|)
  leader: "A" | "B" | null; // team with the lower (better) number that hole
}
export interface VegasResult {
  teamA: [string, string];
  teamB: [string, string];
  aTotal: number;
  bTotal: number;
  margin: number; // + = team A ahead (lower cumulative number)
  leader: "A" | "B" | null;
  points: number; // |margin|
  thru: number; // holes counted (all four scored)
  perHole: VegasHole[];
}

function teamNumber(s1: number, s2: number, oppBirdie: boolean): number {
  const lo = Math.max(1, Math.min(s1, s2));
  const hi = Math.max(1, Math.max(s1, s2));
  return oppBirdie ? Number(`${hi}${lo}`) : Number(`${lo}${hi}`);
}

export function computeVegas(
  holeNumbers: number[],
  scores: Record<string, Record<number, number>>,
  parByHole: Record<number, number>,
  players: string[], // exactly four: [teamA1, teamA2, teamB1, teamB2]
): VegasResult {
  const [a1, a2, b1, b2] = players;
  const teamA: [string, string] = [a1, a2];
  const teamB: [string, string] = [b1, b2];

  let aTotal = 0;
  let bTotal = 0;
  let thru = 0;
  const perHole: VegasHole[] = [];

  for (const h of holeNumbers) {
    const sa1 = scores[a1]?.[h];
    const sa2 = scores[a2]?.[h];
    const sb1 = scores[b1]?.[h];
    const sb2 = scores[b2]?.[h];
    if (sa1 == null || sa2 == null || sb1 == null || sb2 == null) continue; // need all four
    const par = parByHole[h];
    const aBirdie = par != null && (sa1 <= par - 1 || sa2 <= par - 1);
    const bBirdie = par != null && (sb1 <= par - 1 || sb2 <= par - 1);
    // The OPPONENTS' birdie flips your number.
    const aNum = teamNumber(sa1, sa2, bBirdie);
    const bNum = teamNumber(sb1, sb2, aBirdie);
    aTotal += aNum;
    bTotal += bNum;
    thru += 1;
    perHole.push({
      hole: h,
      aScores: [sa1, sa2],
      bScores: [sb1, sb2],
      aNum,
      bNum,
      aFlip: bBirdie,
      bFlip: aBirdie,
      diff: Math.abs(aNum - bNum),
      leader: aNum < bNum ? "A" : bNum < aNum ? "B" : null,
    });
  }

  const margin = bTotal - aTotal; // + = A ahead (A's total is lower)
  const leader = margin === 0 ? null : margin > 0 ? "A" : "B";
  return { teamA, teamB, aTotal, bTotal, margin, leader, points: Math.abs(margin), thru, perHole };
}

/**
 * Per-player net dollars: the point margin × stake is the pot, split evenly so the
 * winning pair each collect and the losing pair each pay. Sums to zero.
 */
export function vegasNet(result: VegasResult, value: number): Record<string, number> {
  const net: Record<string, number> = Object.fromEntries([...result.teamA, ...result.teamB].map((id) => [id, 0]));
  if (!result.leader || result.points === 0) return net;
  const each = (result.points * value) / 2;
  const winners = result.leader === "A" ? result.teamA : result.teamB;
  const losers = result.leader === "A" ? result.teamB : result.teamA;
  for (const id of winners) net[id] = each;
  for (const id of losers) net[id] = -each;
  return net;
}
