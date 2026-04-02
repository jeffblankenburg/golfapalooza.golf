/**
 * Derives foursomes from pairs by matching sort_order across two teams.
 * A foursome's ID = the team1 pair's ID (deterministic, no separate table needed).
 * Only pairs with sort_order > 0 (real pairs, not pool pairs) are considered.
 * Only "complete" foursomes (both pairs present) are returned.
 */

interface PairInput {
  id: string;
  team_id: string;
  sort_order: number;
}

interface TeamInput {
  id: string;
  team_number: number;
}

export interface DerivedFoursome {
  id: string; // = team1 pair's ID
  pair_team1_id: string;
  pair_team2_id: string;
  sort_order: number;
}

export function deriveFoursomes(
  pairs: PairInput[],
  teams: TeamInput[]
): DerivedFoursome[] {
  const team1 = teams.find((t) => t.team_number === 1);
  const team2 = teams.find((t) => t.team_number === 2);
  if (!team1 || !team2) return [];

  const team1Pairs = pairs
    .filter((p) => p.team_id === team1.id && p.sort_order > 0)
    .sort((a, b) => a.sort_order - b.sort_order);
  const team2Pairs = pairs
    .filter((p) => p.team_id === team2.id && p.sort_order > 0)
    .sort((a, b) => a.sort_order - b.sort_order);

  const team2BySortOrder = new Map(team2Pairs.map((p) => [p.sort_order, p]));

  return team1Pairs
    .map((p1) => {
      const p2 = team2BySortOrder.get(p1.sort_order);
      if (!p2) return null;
      return {
        id: p1.id,
        pair_team1_id: p1.id,
        pair_team2_id: p2.id,
        sort_order: p1.sort_order,
      };
    })
    .filter((f): f is DerivedFoursome => f !== null);
}
