/**
 * Nassau (#183): three head-to-head match-play bets in one round — Front 9,
 * Back 9, and Total. Each segment counts holes won: low score wins the hole, ties
 * halve. A match closes out the moment a lead exceeds the holes remaining (e.g.
 * 5&4), and holes after that don't count. "Dormie" = the leader is up by exactly
 * the number of holes left, so they can't lose. Two players. Pure — derived from
 * per-hole scores (gross or net).
 */

export interface NassauSegment {
  key: "front" | "back" | "total";
  label: string;
  up: number; // magnitude of the lead in holes (0 = all square)
  leader: string | null; // round_player_id ahead, or null when square
  remaining: number; // holes left to play in the segment (at closeout, holes that were left)
  complete: boolean; // every hole in the segment has been played
  decided: boolean; // result is final (closed out early, or played to the end with a winner/halve)
  closeout: boolean; // decided BEFORE the last hole (lead > holes remaining)
  dormie: boolean; // leader up by exactly the holes remaining — can't lose
}
export interface NassauResult {
  segments: NassauSegment[];
}

export function computeNassau(
  holeNumbers: number[],
  scores: Record<string, Record<number, number>>,
  a: string,
  b: string,
): NassauResult {
  const front = holeNumbers.filter((h) => h <= 9);
  const back = holeNumbers.filter((h) => h >= 10);
  const hasBoth = front.length > 0 && back.length > 0;

  const segFor = (key: NassauSegment["key"], label: string, holes: number[]): NassauSegment => {
    const sorted = [...holes].sort((x, y) => x - y);
    const segLen = sorted.length;
    let diff = 0; // + = a ahead
    let played = 0;
    let closeoutRemaining: number | null = null;

    for (const h of sorted) {
      const sa = scores[a]?.[h];
      const sb = scores[b]?.[h];
      if (sa == null || sb == null) continue;
      if (sa < sb) diff += 1;
      else if (sb < sa) diff -= 1;
      played += 1;
      const remaining = segLen - played;
      // Lead greater than holes left → match is over; later holes don't count.
      if (Math.abs(diff) > remaining) {
        closeoutRemaining = remaining;
        break;
      }
    }

    const up = Math.abs(diff);
    const leader = diff === 0 ? null : diff > 0 ? a : b;
    const complete = played === segLen;
    const remaining = closeoutRemaining ?? segLen - played;
    const closeout = closeoutRemaining !== null;
    const decided = closeout || complete;
    const dormie = !decided && up > 0 && up === remaining;

    return { key, label, up, leader, remaining, complete, decided, closeout, dormie };
  };

  // 18-hole: Front, Back, Total. Single nine: just the one match (labelled Total).
  const segments = hasBoth
    ? [segFor("front", "Front 9", front), segFor("back", "Back 9", back), segFor("total", "Total", holeNumbers)]
    : [segFor("total", "Total", holeNumbers)];

  return { segments };
}
