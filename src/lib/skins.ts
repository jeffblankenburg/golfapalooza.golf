/**
 * Net skins calculation for scramble contests.
 *
 * Handicap strokes are distributed across holes by difficulty ranking
 * (handicap_index ascending — 1 = hardest hole gets first stroke).
 * A team wins a skin when they have the sole lowest net score on a hole.
 */

import { getStrokesOnHole, sortByDifficulty } from "@/lib/golf/stroke-distribution";

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
  const sortedByDifficulty = sortByDifficulty(holes);

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
      const strokes = getStrokesOnHole(team.team_handicap, hole.hole_number, sortedByDifficulty);
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

// ============================================================
// Skins pot distribution
// ============================================================
//
// Splits a skins pot among winning teams using whole-dollar amounts that
// sum EXACTLY to the pool. Rules:
//
//   1. Each team's fair share is (team_skins / total_skins) × pool.
//   2. Round each team's per-player share DOWN to the nearest $1.
//   3. The residual ($0–N) goes entirely to the top team (most skins,
//      smaller team breaks ties).
//   4. Bump the top team's per-player amount uniformly by $1 as many
//      times as the residual allows (residual ≥ team_size).
//   5. If a sub-team-size residual remains, distribute it as +$1 to the
//      top team's first N players (within-team non-uniformity by at
//      most $1 — Sheiker hands a slightly bigger envelope to N members).
//
// Within-team uniformity is preferred but breakable when (a) the top
// team's size doesn't divide the remaining pool cleanly and (b)
// dropping the residual onto a lower-priority team would violate the
// "favor the team that won more" rule.
//
// Pool is dollars (NOT cents). Function returns whole-dollar amounts.

export interface SkinsPayoutTeam {
  id: string;
  skins: number;
  member_user_ids: string[];
}

export interface SkinsPayoutResult {
  team_id: string;
  team_total: number;
  per_player: Map<string, number>;
}

export function distributeSkinsPot(
  pool: number,
  teams: SkinsPayoutTeam[],
): SkinsPayoutResult[] {
  const totalSkins = teams.reduce((s, t) => s + t.skins, 0);
  if (pool <= 0 || totalSkins === 0) {
    return teams.map((t) => ({
      team_id: t.id,
      team_total: 0,
      per_player: new Map(t.member_user_ids.map((u) => [u, 0] as const)),
    }));
  }

  type Working = {
    team: SkinsPayoutTeam;
    per_player_floor: number;
    leftover_players: number;
    team_total: number;
  };

  const working: Working[] = teams.map((t) => {
    const teamSize = t.member_user_ids.length || 1;
    const raw = (t.skins / totalSkins) * pool / teamSize;
    const floor = Math.floor(raw);
    return {
      team: t,
      per_player_floor: floor,
      leftover_players: 0,
      team_total: floor * t.member_user_ids.length,
    };
  });

  let residual = pool - working.reduce((s, w) => s + w.team_total, 0);

  // Priority: most skins desc, smaller team_size asc, then team_id asc
  // (deterministic). Non-winning teams never receive a bump.
  const queue = working
    .filter((w) => w.team.skins > 0)
    .sort((a, b) => {
      if (b.team.skins !== a.team.skins) return b.team.skins - a.team.skins;
      const aSize = a.team.member_user_ids.length;
      const bSize = b.team.member_user_ids.length;
      if (aSize !== bSize) return aSize - bSize;
      return a.team.id < b.team.id ? -1 : 1;
    });

  for (const w of queue) {
    const teamSize = w.team.member_user_ids.length;
    if (teamSize === 0) continue;
    // Uniform bumps while we can.
    while (residual >= teamSize) {
      w.per_player_floor += 1;
      w.team_total += teamSize;
      residual -= teamSize;
    }
    // Within-team uneven distribution for the remainder. Only the FIRST
    // priority team is allowed to absorb sub-team-size residuals; lower-
    // priority teams stay at their floor so we never favor them over the
    // higher-skin team.
    if (residual > 0 && w === queue[0]) {
      w.leftover_players = residual;
      w.team_total += residual;
      residual = 0;
    }
    if (residual === 0) break;
  }

  return working.map((w) => {
    const per_player = new Map<string, number>();
    for (let i = 0; i < w.team.member_user_ids.length; i++) {
      const uid = w.team.member_user_ids[i];
      per_player.set(uid, w.per_player_floor + (i < w.leftover_players ? 1 : 0));
    }
    return {
      team_id: w.team.id,
      team_total: w.team_total,
      per_player,
    };
  });
}
