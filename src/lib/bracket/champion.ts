/**
 * Determine the overall champion participant ID for a set of bracket matches.
 * Double elimination: reset (round 2) winner > championship round 1 slot1 winner > null
 * Single elimination: final round winner
 */

export interface BracketMatch {
  bracket_type: string;
  round_number: number;
  match_number: number;
  slot1_participant_id: string | null;
  slot2_participant_id: string | null;
  winner_participant_id: string | null;
}

export function computeChampionId(matches: BracketMatch[]): string | null {
  // Check for double-elimination championship matches
  const champMatches = matches.filter((m) => m.bracket_type === "championship");
  if (champMatches.length > 0) {
    const reset = champMatches.find((m) => m.round_number === 2);
    if (reset?.winner_participant_id) return reset.winner_participant_id;
    const champ = champMatches.find((m) => m.round_number === 1);
    if (
      champ?.winner_participant_id &&
      champ.winner_participant_id === champ.slot1_participant_id
    ) {
      // WB champion won — tournament over
      return champ.winner_participant_id;
    }
    return null;
  }

  // Single elimination: find the match in the "main" bracket with the highest round
  const mainMatches = matches.filter((m) => m.bracket_type === "main");
  if (mainMatches.length === 0) return null;
  const maxRound = Math.max(...mainMatches.map((m) => m.round_number));
  const finalMatch = mainMatches.find((m) => m.round_number === maxRound);
  return finalMatch?.winner_participant_id || null;
}
