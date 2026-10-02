import { strokesReceivedOnHole } from "@/lib/v2/golf/calculator";

/**
 * Scramble skins (#209). Per hole, the team with the UNIQUE low score wins the
 * skin; ties push (carry to the next decided hole when carryover is on, else the
 * skin is dead). Net uses each team's adjusted handicap (lowest team plays 0) and
 * the hole's stroke index; gross uses raw team scores. Only teams that have
 * recorded a score count as "in the field", and a hole is decided once all of them
 * have scored it (so partial rounds compute live).
 */

export interface SkinsRow { team_id: string; skins: number }
export interface SkinsResult { rows: SkinsRow[]; decided: number; pending: number }

export function computeSkins(
  teams: { id: string; team_handicap: number | null }[],
  scoresByTeam: Record<string, Record<number, number>>,
  holes: { hole_number: number; handicap_index: number }[],
  opts: { net: boolean; carryover: boolean },
): SkinsResult {
  const active = teams.filter((t) => scoresByTeam[t.id] && Object.keys(scoresByTeam[t.id]).length > 0);
  if (active.length < 2) return { rows: active.map((t) => ({ team_id: t.id, skins: 0 })), decided: 0, pending: holes.length };

  const lowest = Math.min(...active.map((t) => t.team_handicap ?? 0));
  const adjOf = (t: { team_handicap: number | null }) => Math.max(0, (t.team_handicap ?? 0) - lowest);

  const skins: Record<string, number> = {};
  for (const t of active) skins[t.id] = 0;

  let carry = 1;
  let decided = 0;
  let pending = 0;
  const sorted = [...holes].sort((a, b) => a.hole_number - b.hole_number);
  for (const h of sorted) {
    const entries: { team_id: string; score: number }[] = [];
    let allScored = true;
    for (const t of active) {
      const gross = scoresByTeam[t.id]?.[h.hole_number];
      if (gross == null) { allScored = false; break; }
      const score = opts.net ? gross - strokesReceivedOnHole(h.handicap_index, adjOf(t)) : gross;
      entries.push({ team_id: t.id, score });
    }
    if (!allScored) { pending++; continue; }
    decided++;
    const min = Math.min(...entries.map((e) => e.score));
    const winners = entries.filter((e) => e.score === min);
    if (winners.length === 1) {
      skins[winners[0].team_id] += carry;
      carry = 1;
    } else if (opts.carryover) {
      carry += 1;
    }
  }

  const rows = active.map((t) => ({ team_id: t.id, skins: skins[t.id] })).sort((a, b) => b.skins - a.skins);
  return { rows, decided, pending };
}
