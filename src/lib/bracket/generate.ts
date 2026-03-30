/**
 * Pure bracket generation logic — no database calls.
 *
 * Generates match structures for single-elimination and double-elimination
 * cornhole brackets, with standard seeding and bye placement.
 */

export interface BracketMatch {
  /** Array index used for linkage resolution before DB insert */
  index: number;
  bracket_type: "main" | "winners" | "losers" | "championship";
  round_number: number;
  match_number: number;
  slot1_participant_id: string | null;
  slot2_participant_id: string | null;
  seed1: number | null;
  seed2: number | null;
  is_bye: boolean;
  /** Index into the returned array — resolved to UUID after insert */
  next_winner_match_index: number | null;
  next_winner_slot: 1 | 2 | null;
  next_loser_match_index: number | null;
  next_loser_slot: 1 | 2 | null;
}

/** Smallest power of 2 >= n */
export function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Standard seed pairings for a bracket of given size.
 * Returns an array of [seed1, seed2] for each first-round match.
 * Uses the "fold" pattern: 1v16, 8v9, 5v12, 4v13, 3v14, 6v11, 7v10, 2v15
 */
export function getStandardSeedPositions(bracketSize: number): [number, number][] {
  if (bracketSize < 2) return [];
  const matches: [number, number][] = [];

  function fillBracket(pos: number[], round: number): number[] {
    if (pos.length === bracketSize) return pos;
    const next: number[] = [];
    for (const p of pos) {
      const complement = round + 1 - p;
      next.push(p, complement);
    }
    return fillBracket(next, round * 2);
  }

  const seeds = fillBracket([1], 2);
  for (let i = 0; i < seeds.length; i += 2) {
    matches.push([seeds[i], seeds[i + 1]]);
  }
  return matches;
}

/**
 * Generate a single-elimination bracket.
 *
 * @param participantCount Number of participants (2–64)
 * @param participantIds Optional ordered list of participant UUIDs (index 0 = seed 1)
 */
export function generateSingleElimination(
  participantCount: number,
  participantIds?: string[]
): BracketMatch[] {
  const bracketSize = nextPowerOf2(participantCount);
  const totalRounds = Math.log2(bracketSize);
  const seedPairs = getStandardSeedPositions(bracketSize);

  const matches: BracketMatch[] = [];
  let indexCounter = 0;

  // Build all rounds from final to first so we can set next-match links
  const roundMatches: number[][] = []; // roundMatches[round] = array of match indices

  for (let round = totalRounds; round >= 1; round--) {
    const matchCount = bracketSize / Math.pow(2, round);
    const roundIndices: number[] = [];
    for (let m = 0; m < matchCount; m++) {
      const idx = indexCounter++;
      roundIndices.push(idx);
      matches.push({
        index: idx,
        bracket_type: "main",
        round_number: round,
        match_number: m + 1,
        slot1_participant_id: null,
        slot2_participant_id: null,
        seed1: null,
        seed2: null,
        is_bye: false,
        next_winner_match_index: null,
        next_winner_slot: null,
        next_loser_match_index: null,
        next_loser_slot: null,
      });
    }
    roundMatches[round] = roundIndices;
  }

  // Set next_winner links (round N match M feeds into round N+1 match floor(M/2))
  for (let round = 1; round < totalRounds; round++) {
    const indices = roundMatches[round];
    const nextIndices = roundMatches[round + 1];
    for (let m = 0; m < indices.length; m++) {
      const nextMatchIdx = nextIndices[Math.floor(m / 2)];
      matches[indices[m]].next_winner_match_index = nextMatchIdx;
      matches[indices[m]].next_winner_slot = (m % 2 === 0 ? 1 : 2) as 1 | 2;
    }
  }

  // Seed first-round matches
  const firstRound = roundMatches[1];
  for (let m = 0; m < firstRound.length; m++) {
    const [s1, s2] = seedPairs[m];
    const match = matches[firstRound[m]];
    match.seed1 = s1;
    match.seed2 = s2;

    if (participantIds) {
      match.slot1_participant_id = s1 <= participantCount ? (participantIds[s1 - 1] ?? null) : null;
      match.slot2_participant_id = s2 <= participantCount ? (participantIds[s2 - 1] ?? null) : null;
    }

    // Handle byes: if a seed exceeds participant count, it's a bye
    const s1IsBye = s1 > participantCount;
    const s2IsBye = s2 > participantCount;
    if (s1IsBye || s2IsBye) {
      match.is_bye = true;
      // The non-bye participant auto-advances
      if (participantIds && match.next_winner_match_index !== null && match.next_winner_slot !== null) {
        const advancingId = s1IsBye ? match.slot2_participant_id : match.slot1_participant_id;
        const nextMatch = matches[match.next_winner_match_index];
        if (match.next_winner_slot === 1) {
          nextMatch.slot1_participant_id = advancingId;
        } else {
          nextMatch.slot2_participant_id = advancingId;
        }
      }
    }
  }

  return matches;
}

/**
 * Generate a double-elimination bracket.
 *
 * Winners bracket + losers bracket + championship match(es).
 *
 * @param participantCount Number of participants (2–64)
 * @param participantIds Optional ordered list of participant UUIDs (index 0 = seed 1)
 */
export function generateDoubleElimination(
  participantCount: number,
  participantIds?: string[]
): BracketMatch[] {
  const bracketSize = nextPowerOf2(participantCount);
  const wRounds = Math.log2(bracketSize);
  const seedPairs = getStandardSeedPositions(bracketSize);

  const matches: BracketMatch[] = [];
  let indexCounter = 0;

  function addMatch(
    bracket_type: BracketMatch["bracket_type"],
    round_number: number,
    match_number: number
  ): number {
    const idx = indexCounter++;
    matches.push({
      index: idx,
      bracket_type,
      round_number,
      match_number,
      slot1_participant_id: null,
      slot2_participant_id: null,
      seed1: null,
      seed2: null,
      is_bye: false,
      next_winner_match_index: null,
      next_winner_slot: null,
      next_loser_match_index: null,
      next_loser_slot: null,
    });
    return idx;
  }

  // ── Winners bracket ──
  const wRoundMatches: number[][] = [];
  for (let round = 1; round <= wRounds; round++) {
    const count = bracketSize / Math.pow(2, round);
    const indices: number[] = [];
    for (let m = 0; m < count; m++) {
      indices.push(addMatch("winners", round, m + 1));
    }
    wRoundMatches[round] = indices;
  }

  // Winners bracket linkages
  for (let round = 1; round < wRounds; round++) {
    const cur = wRoundMatches[round];
    const next = wRoundMatches[round + 1];
    for (let m = 0; m < cur.length; m++) {
      matches[cur[m]].next_winner_match_index = next[Math.floor(m / 2)];
      matches[cur[m]].next_winner_slot = (m % 2 === 0 ? 1 : 2) as 1 | 2;
    }
  }

  // ── Losers bracket ──
  // Standard double-elim losers bracket has 2*(wRounds-1) rounds.
  // Match counts come in pairs with the same count, halving each pair:
  //   LR1,LR2 = bracketSize/4;  LR3,LR4 = bracketSize/8;  etc.
  // Odd rounds (LR1): WR1 losers pair up (both slots filled by drops).
  // Even rounds (LR2,LR4,...): slot 1 from previous LR winner, slot 2 from WR drop.
  // Odd rounds after LR1 (LR3,LR5,...): pure reduction of previous even round.
  const lRounds = 2 * (wRounds - 1);
  const lRoundMatches: number[][] = [];

  for (let lr = 1; lr <= lRounds; lr++) {
    const pairIndex = Math.floor((lr - 1) / 2); // 0,0,1,1,2,2,...
    const matchCount = bracketSize / Math.pow(2, pairIndex + 2);
    const indices: number[] = [];
    for (let m = 0; m < matchCount; m++) {
      indices.push(addMatch("losers", lr, m + 1));
    }
    lRoundMatches[lr] = indices;
  }

  // Losers bracket internal linkages
  for (let lr = 1; lr < lRounds; lr++) {
    const cur = lRoundMatches[lr];
    const next = lRoundMatches[lr + 1];
    if (lr % 2 === 1) {
      // Odd → Even (e.g. LR1→LR2): 1:1, winner goes to slot 1
      // (slot 2 will be filled by WR drop)
      for (let m = 0; m < cur.length && m < next.length; m++) {
        matches[cur[m]].next_winner_match_index = next[m];
        matches[cur[m]].next_winner_slot = 1;
      }
    } else {
      // Even → Odd (e.g. LR2→LR3): 2:1 reduction, standard bracket pairing
      for (let m = 0; m < cur.length; m++) {
        const nextIdx = Math.floor(m / 2);
        if (nextIdx < next.length) {
          matches[cur[m]].next_winner_match_index = next[nextIdx];
          matches[cur[m]].next_winner_slot = (m % 2 === 0 ? 1 : 2) as 1 | 2;
        }
      }
    }
  }

  // ── Winners → Losers drops ──
  // WR1 → LR1: 2:1 mapping (4 WR1 losers pair into 2 LR1 matches, both slots)
  {
    const wIndices = wRoundMatches[1];
    const lIndices = lRoundMatches[1];
    for (let m = 0; m < wIndices.length; m++) {
      const lMatchIdx = Math.floor(m / 2);
      if (lMatchIdx < lIndices.length) {
        matches[wIndices[m]].next_loser_match_index = lIndices[lMatchIdx];
        matches[wIndices[m]].next_loser_slot = (m % 2 === 0 ? 1 : 2) as 1 | 2;
      }
    }
  }

  // WR(k) for k>=2 → LR(2(k-1)): 1:1, slot 2
  // Even losers rounds receive WR drops.  Includes winners final (wRounds).
  for (let wR = 2; wR <= wRounds; wR++) {
    const lrTarget = 2 * (wR - 1); // Even losers round
    if (lrTarget > lRounds) break;
    const wIndices = wRoundMatches[wR];
    const lIndices = lRoundMatches[lrTarget];
    for (let m = 0; m < wIndices.length && m < lIndices.length; m++) {
      matches[wIndices[m]].next_loser_match_index = lIndices[m];
      matches[wIndices[m]].next_loser_slot = 2;
    }
  }

  // ── Championship ──
  const champIdx = addMatch("championship", 1, 1);
  // Winners final → championship slot 1
  const wFinal = wRoundMatches[wRounds];
  matches[wFinal[0]].next_winner_match_index = champIdx;
  matches[wFinal[0]].next_winner_slot = 1;
  // Losers final → championship slot 2
  const lFinal = lRoundMatches[lRounds];
  matches[lFinal[0]].next_winner_match_index = champIdx;
  matches[lFinal[0]].next_winner_slot = 2;

  // Optional: championship reset match (if loser-bracket winner wins championship)
  const resetIdx = addMatch("championship", 2, 1);
  matches[champIdx].next_loser_match_index = resetIdx;
  matches[champIdx].next_loser_slot = null; // special: only used if LB winner wins

  // ── Seed first-round winners matches ──
  const firstWRound = wRoundMatches[1];
  for (let m = 0; m < firstWRound.length; m++) {
    const [s1, s2] = seedPairs[m];
    const match = matches[firstWRound[m]];
    match.seed1 = s1;
    match.seed2 = s2;

    if (participantIds) {
      match.slot1_participant_id = s1 <= participantCount ? (participantIds[s1 - 1] ?? null) : null;
      match.slot2_participant_id = s2 <= participantCount ? (participantIds[s2 - 1] ?? null) : null;
    }

    const s1IsBye = s1 > participantCount;
    const s2IsBye = s2 > participantCount;
    if (s1IsBye || s2IsBye) {
      match.is_bye = true;
      if (participantIds && match.next_winner_match_index !== null && match.next_winner_slot !== null) {
        const advancingId = s1IsBye ? match.slot2_participant_id : match.slot1_participant_id;
        const nextMatch = matches[match.next_winner_match_index];
        if (match.next_winner_slot === 1) {
          nextMatch.slot1_participant_id = advancingId;
        } else {
          nextMatch.slot2_participant_id = advancingId;
        }
      }
    }
  }

  // ── Cascade byes through losers bracket ──
  // Process from early to late rounds.  If a losers match has zero or one
  // viable (non-bye) feeder slots, mark it as a bye and redirect the viable
  // feeder (if any) to this match's downstream destination.  Processing in
  // round order guarantees earlier byes are resolved before checking later ones.
  for (let lr = 1; lr <= lRounds; lr++) {
    for (const lrIdx of lRoundMatches[lr]) {
      if (matches[lrIdx].is_bye) continue;

      const slot1OK =
        !!matches[lrIdx].slot1_participant_id ||
        matches.some(
          (m) =>
            !m.is_bye &&
            ((m.next_winner_match_index === lrIdx && m.next_winner_slot === 1) ||
              (m.next_loser_match_index === lrIdx && m.next_loser_slot === 1))
        );
      const slot2OK =
        !!matches[lrIdx].slot2_participant_id ||
        matches.some(
          (m) =>
            !m.is_bye &&
            ((m.next_winner_match_index === lrIdx && m.next_winner_slot === 2) ||
              (m.next_loser_match_index === lrIdx && m.next_loser_slot === 2))
        );

      if (slot1OK && slot2OK) continue; // Real match — both slots will be filled

      // Mark as bye and redirect all non-bye feeders to the downstream match
      matches[lrIdx].is_bye = true;
      const downIdx = matches[lrIdx].next_winner_match_index;
      const downSlot = matches[lrIdx].next_winner_slot;
      if (downIdx === null) continue;

      for (const m of matches) {
        if (m.is_bye) continue;
        if (m.next_winner_match_index === lrIdx) {
          m.next_winner_match_index = downIdx;
          m.next_winner_slot = downSlot;
        }
        if (m.next_loser_match_index === lrIdx) {
          m.next_loser_match_index = downIdx;
          m.next_loser_slot = downSlot;
        }
      }
    }
  }

  return matches;
}
