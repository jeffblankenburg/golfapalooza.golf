// Shared detection for INCOMPLETE rounds — a round set up for 18 (or 9) holes
// that was scored hole-by-hole but never finished (e.g. rained out after 9/12).
//
// Such a round's stored `final_gross_score` is the sum of ONLY the holes that
// were played, so it masquerades as an absurdly low full round. We label it
// wherever a round is shown and keep it out of every best/average aggregate.
//
// A round is NOT incomplete when it has zero scored holes — that's a trusted
// quick-entry round where the user typed a full gross. Handicap-eligibility
// already relies on the same "0 holes OR full holes" distinction.

export function expectedHoleCount(roundType: string): number {
  return roundType === "18" ? 18 : 9;
}

export function isRoundIncomplete(
  roundType: string,
  holesPlayed: number,
  hasGross: boolean,
): boolean {
  return hasGross && holesPlayed > 0 && holesPlayed < expectedHoleCount(roundType);
}
