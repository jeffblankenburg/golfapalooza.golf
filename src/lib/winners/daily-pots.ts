// Daily contest pot allocator. Handles the carry-forward rules that
// kick in when nobody hits a designated shot:
//
//   CTP (front + back per day):
//     - "No winner" on one side → that side's share folds into the other
//       side same day. The hitter gets the combined day total.
//     - "No winner" on both sides → the day's combined total carries to
//       the next day's CTP pots, split per the $5 rule below.
//     - Last day "no winner" on both sides → forfeited (next-year budget).
//
//   $5 rule: per-day CTP pot is split Front/Back as
//     front = floor(total / 2 / 5) * 5
//     back  = total - front
//   so each side is a multiple of $5 and the leftover $5 always lands on
//   the back. Example: $205 day total → $100 front, $105 back.
//
//   Long Drive (one contest per day):
//     - "No winner" → pot carries to next day's LD.
//     - Last day "no winner" → forfeited.
//
//   Long Putt: always has a winner; not handled here.
//
// This module is pure-data so it can be reused by the display layer,
// the materializer, and the cash-needed sheet. Inputs are the per-day
// contest rows + their base pots + their resolution states; output is
// a Map of contest_id → adjusted payout amount.

export type DailySide = "front" | "back" | "ld";

export interface DailyContestInput {
  id: string;
  day_number: number;
  side: DailySide;
  /** Pre-carry pot from cost_items × participants × day_count. */
  base_pot: number;
  has_winner: boolean;
  declared_no_winner: boolean;
}

export interface DailyContestAllocation {
  id: string;
  day_number: number;
  side: DailySide;
  /** Pot the contest is "in for" after carries — payout if there's a winner. */
  adjusted_pot: number;
  /**
   * If the contest's pot got rolled forward (or sideways), this is the
   * destination contest id. For UI hints like "carried to Back 9" or
   * "carried to Friday". null = no carry (winner paid, or forfeited).
   */
  carried_to_contest_id: string | null;
  /** True when the day is the last one and both sides went unwon. */
  forfeited: boolean;
}

const round5Down = (n: number) => Math.floor(n / 5) * 5;

/**
 * Allocate per-day CTP pots. Returns one allocation row per input contest.
 * Inputs may be in any order; output preserves input order.
 *
 * Pre-conditions:
 *   - At most one front and one back contest per day_number
 *   - base_pot in dollars (>= 0)
 *   - declared_no_winner == true ⇒ has_winner == false
 */
export function allocateCtpDailyPots(
  contests: DailyContestInput[],
): DailyContestAllocation[] {
  if (contests.length === 0) return [];

  // Group by day, keeping front/back separately.
  const byDay = new Map<number, { front?: DailyContestInput; back?: DailyContestInput }>();
  for (const c of contests) {
    if (c.side !== "front" && c.side !== "back") continue;
    const entry = byDay.get(c.day_number) || {};
    if (c.side === "front") entry.front = c;
    else entry.back = c;
    byDay.set(c.day_number, entry);
  }

  const sortedDays = [...byDay.keys()].sort((a, b) => a - b);
  if (sortedDays.length === 0) return contests.map(emptyAllocation);

  const lastDay = sortedDays[sortedDays.length - 1];
  const allocByContestId = new Map<string, DailyContestAllocation>();
  let carryIn = 0;

  for (const day of sortedDays) {
    const { front, back } = byDay.get(day)!;
    const baseTotal = (front?.base_pot ?? 0) + (back?.base_pot ?? 0);
    const dayTotal = baseTotal + carryIn;

    // $5 split on the day total. If only one side exists, that side
    // gets everything.
    let frontShare = 0;
    let backShare = 0;
    if (front && back) {
      frontShare = round5Down(dayTotal / 2);
      backShare = dayTotal - frontShare;
    } else if (front) {
      frontShare = dayTotal;
    } else if (back) {
      backShare = dayTotal;
    }

    const frontWon = !!front?.has_winner;
    const backWon = !!back?.has_winner;
    const frontVoid = !!front?.declared_no_winner;
    const backVoid = !!back?.declared_no_winner;

    // Same-day fold: if one side is void and the other has a winner,
    // the winner takes both shares.
    if (frontVoid && backWon && back) {
      allocByContestId.set(back.id, {
        id: back.id,
        day_number: day,
        side: "back",
        adjusted_pot: frontShare + backShare,
        carried_to_contest_id: null,
        forfeited: false,
      });
      if (front) {
        allocByContestId.set(front.id, {
          id: front.id,
          day_number: day,
          side: "front",
          adjusted_pot: 0,
          carried_to_contest_id: back.id,
          forfeited: false,
        });
      }
      carryIn = 0;
      continue;
    }
    if (backVoid && frontWon && front) {
      allocByContestId.set(front.id, {
        id: front.id,
        day_number: day,
        side: "front",
        adjusted_pot: frontShare + backShare,
        carried_to_contest_id: null,
        forfeited: false,
      });
      if (back) {
        allocByContestId.set(back.id, {
          id: back.id,
          day_number: day,
          side: "back",
          adjusted_pot: 0,
          carried_to_contest_id: front.id,
          forfeited: false,
        });
      }
      carryIn = 0;
      continue;
    }

    // Both void → carry the combined day total forward (or forfeit on
    // the last day).
    if (frontVoid && backVoid) {
      const isLastDay = day === lastDay;
      const nextDayKey = sortedDays.find((d) => d > day) ?? null;
      const nextBack = nextDayKey != null ? byDay.get(nextDayKey)?.back?.id ?? null : null;
      const nextFront = nextDayKey != null ? byDay.get(nextDayKey)?.front?.id ?? null : null;
      const carryTarget = nextBack || nextFront; // single id is enough; carry splits to both
      if (front) {
        allocByContestId.set(front.id, {
          id: front.id,
          day_number: day,
          side: "front",
          adjusted_pot: 0,
          carried_to_contest_id: isLastDay ? null : carryTarget,
          forfeited: isLastDay,
        });
      }
      if (back) {
        allocByContestId.set(back.id, {
          id: back.id,
          day_number: day,
          side: "back",
          adjusted_pot: 0,
          carried_to_contest_id: isLastDay ? null : carryTarget,
          forfeited: isLastDay,
        });
      }
      carryIn = isLastDay ? 0 : frontShare + backShare;
      continue;
    }

    // Default path: each side gets its share (front/back may or may
    // not have a winner — the share is the payout if they do).
    if (front) {
      allocByContestId.set(front.id, {
        id: front.id,
        day_number: day,
        side: "front",
        adjusted_pot: frontShare,
        carried_to_contest_id: null,
        forfeited: false,
      });
    }
    if (back) {
      allocByContestId.set(back.id, {
        id: back.id,
        day_number: day,
        side: "back",
        adjusted_pot: backShare,
        carried_to_contest_id: null,
        forfeited: false,
      });
    }
    carryIn = 0;
  }

  // Preserve input order
  return contests.map((c) => allocByContestId.get(c.id) ?? emptyAllocation(c));
}

/**
 * Allocate per-day Long Drive pots. One contest per day, simple chain:
 * winner takes the pot (incl. carry); no_winner carries to next day;
 * last day no_winner → forfeited.
 */
export function allocateLongDrivePots(
  contests: DailyContestInput[],
): DailyContestAllocation[] {
  if (contests.length === 0) return [];

  const byDay = new Map<number, DailyContestInput>();
  for (const c of contests) {
    if (c.side !== "ld") continue;
    byDay.set(c.day_number, c);
  }
  const sortedDays = [...byDay.keys()].sort((a, b) => a - b);
  if (sortedDays.length === 0) return contests.map(emptyAllocation);

  const lastDay = sortedDays[sortedDays.length - 1];
  const allocByContestId = new Map<string, DailyContestAllocation>();
  let carryIn = 0;

  for (const day of sortedDays) {
    const c = byDay.get(day)!;
    const dayTotal = c.base_pot + carryIn;

    if (c.declared_no_winner) {
      const isLastDay = day === lastDay;
      const nextDayKey = sortedDays.find((d) => d > day) ?? null;
      const nextContestId = nextDayKey != null ? byDay.get(nextDayKey)?.id ?? null : null;
      allocByContestId.set(c.id, {
        id: c.id,
        day_number: day,
        side: "ld",
        adjusted_pot: 0,
        carried_to_contest_id: isLastDay ? null : nextContestId,
        forfeited: isLastDay,
      });
      carryIn = isLastDay ? 0 : dayTotal;
      continue;
    }

    allocByContestId.set(c.id, {
      id: c.id,
      day_number: day,
      side: "ld",
      adjusted_pot: dayTotal,
      carried_to_contest_id: null,
      forfeited: false,
    });
    carryIn = 0;
  }

  return contests.map((c) => allocByContestId.get(c.id) ?? emptyAllocation(c));
}

function emptyAllocation(c: DailyContestInput): DailyContestAllocation {
  return {
    id: c.id,
    day_number: c.day_number,
    side: c.side,
    adjusted_pot: c.base_pot,
    carried_to_contest_id: null,
    forfeited: false,
  };
}
