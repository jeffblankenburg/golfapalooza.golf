/**
 * Net skins calculation for scramble contests.
 *
 * Handicap strokes are distributed across holes by difficulty ranking
 * (handicap_index ascending — 1 = hardest hole gets first stroke).
 * A team wins a skin when they have the sole lowest net score on a hole.
 */

export interface SkinTeam {
  id: string;
  team_handicap: number;
}

export interface SkinHole {
  hole_number: number;
  handicap_index: number;
}

export interface SkinsResult {
  /** Number of skins won per team id */
  skinCounts: Map<string, number>;
  /** Set of hole numbers where each team won a skin */
  skinWins: Map<string, Set<number>>;
  /** Total skins awarded across all teams */
  totalSkins: number;
}

export function calcSkins(
  teams: SkinTeam[],
  holes: SkinHole[],
  holeScores: Record<string, Record<number, number>>
): SkinsResult {
  const sortedByDifficulty = [...holes].sort((a, b) => a.handicap_index - b.handicap_index);

  function getStrokesOnHole(teamHandicap: number, holeNumber: number): number {
    const holeRank = sortedByDifficulty.findIndex((h) => h.hole_number === holeNumber);
    if (holeRank === -1) return 0;
    const fullPasses = Math.floor(teamHandicap / 18);
    const remainder = teamHandicap % 18;
    return fullPasses + (holeRank < remainder ? 1 : 0);
  }

  const skinCounts = new Map<string, number>();
  const skinWins = new Map<string, Set<number>>();
  let totalSkins = 0;

  for (const team of teams) {
    skinCounts.set(team.id, 0);
    skinWins.set(team.id, new Set());
  }

  for (const hole of holes) {
    const netScores: { teamId: string; net: number }[] = [];
    let allHaveScores = true;

    for (const team of teams) {
      const gross = holeScores[team.id]?.[hole.hole_number];
      if (gross === undefined) { allHaveScores = false; break; }
      const strokes = getStrokesOnHole(team.team_handicap, hole.hole_number);
      netScores.push({ teamId: team.id, net: gross - strokes });
    }

    if (!allHaveScores) continue;

    const minNet = Math.min(...netScores.map((s) => s.net));
    const winners = netScores.filter((s) => s.net === minNet);
    if (winners.length === 1) {
      skinCounts.set(winners[0].teamId, (skinCounts.get(winners[0].teamId) || 0) + 1);
      skinWins.get(winners[0].teamId)!.add(hole.hole_number);
      totalSkins++;
    }
  }

  return { skinCounts, skinWins, totalSkins };
}
