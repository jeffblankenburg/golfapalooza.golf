/**
 * Cornhole winner resolution.
 * Derives champion and runner-up from bracket matches using computeChampionId.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { computeChampionId } from "@/lib/bracket/champion";

interface BracketMatch {
  bracket_type: string;
  round_number: number;
  match_number: number;
  slot1_participant_id: string | null;
  slot2_participant_id: string | null;
  winner_participant_id: string | null;
}

/**
 * Resolve the cornhole winner (or runner-up) for a contest.
 * place=1: champion, place=2: runner-up (loser of the final match)
 * For singles: returns [user_id]
 * For doubles: returns [user_id1, user_id2]
 * Returns null if bracket is incomplete.
 */
export async function resolveCornholeWinner(
  supabase: SupabaseClient,
  contestId: string,
  type: "cornhole_singles" | "cornhole_doubles",
  place: number = 1
): Promise<string[] | null> {
  // Fetch all bracket matches
  const { data: matches, error: matchErr } = await supabase
    .from("cornhole_bracket_matches")
    .select("bracket_type, round_number, match_number, slot1_participant_id, slot2_participant_id, winner_participant_id")
    .eq("contest_id", contestId);

  if (matchErr) throw new Error(matchErr.message);
  if (!matches || matches.length === 0) return null;

  const championId = computeChampionId(matches);
  if (!championId) return null;

  let targetId: string | null = null;

  if (place === 1) {
    targetId = championId;
  } else if (place === 2) {
    targetId = findRunnerUp(matches, championId);
  }

  if (!targetId) return null;

  if (type === "cornhole_singles") {
    return [targetId];
  }

  // For doubles, look up team members
  const { data: teamMembers, error: memberErr } = await supabase
    .from("cornhole_team_members")
    .select("user_id")
    .eq("team_id", targetId);

  if (memberErr) throw new Error(memberErr.message);
  if (!teamMembers || teamMembers.length === 0) return null;

  return teamMembers.map((m) => m.user_id);
}

/**
 * Find the runner-up (loser of the final match) from bracket matches.
 */
function findRunnerUp(matches: BracketMatch[], championId: string): string | null {
  // Double elimination: check championship matches
  const champMatches = matches.filter((m) => m.bracket_type === "championship");
  if (champMatches.length > 0) {
    // Check reset match first (round 2)
    const reset = champMatches.find((m) => m.round_number === 2 && m.winner_participant_id);
    if (reset) {
      return reset.slot1_participant_id === championId
        ? reset.slot2_participant_id
        : reset.slot1_participant_id;
    }
    // Championship round 1 (WB champion won outright)
    const champ = champMatches.find((m) => m.round_number === 1 && m.winner_participant_id);
    if (champ) {
      return champ.slot1_participant_id === championId
        ? champ.slot2_participant_id
        : champ.slot1_participant_id;
    }
    return null;
  }

  // Single elimination: final round match
  const mainMatches = matches.filter((m) => m.bracket_type === "main");
  if (mainMatches.length === 0) return null;
  const maxRound = Math.max(...mainMatches.map((m) => m.round_number));
  const finalMatch = mainMatches.find((m) => m.round_number === maxRound);
  if (!finalMatch?.winner_participant_id) return null;

  return finalMatch.slot1_participant_id === championId
    ? finalMatch.slot2_participant_id
    : finalMatch.slot1_participant_id;
}
