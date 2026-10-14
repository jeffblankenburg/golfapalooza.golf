/**
 * Boxes / Squares pure scoring (#230). Deterministic: given the grid of owners,
 * the row/column digit assignments, and the scores, the winning square is fixed.
 *
 * ONE function, three consumers that can never disagree:
 *   - the live in-game highlight (current score → currently-winning square),
 *   - the per-period payout (period-end score → that period's winner),
 *   - the Simulate test panel (#232) (typed scores → verify before real games).
 * No ESPN, no DB — pure data in, winners out.
 */

export interface BoxesGridState {
  /** Owner label/id keyed by "row,col" (0-9 grid positions). Missing = unsold. */
  owners: Record<string, string | null>;
  /** Digit (0-9) assigned to each of the 10 rows; [] until drawn + locked. */
  rowDigits: number[];
  /** Digit (0-9) assigned to each of the 10 columns; [] until drawn + locked. */
  colDigits: number[];
}

export interface Cell {
  row: number;
  col: number;
}

export const cellKey = (row: number, col: number) => `${row},${col}`;

export const lastDigit = (score: number | null | undefined): number | null =>
  score == null ? null : ((Math.trunc(score) % 10) + 10) % 10;

export const digitsDrawn = (grid: BoxesGridState) => grid.rowDigits.length === 10 && grid.colDigits.length === 10;

/**
 * The square that wins for a pair of scores — or null if the digits aren't drawn
 * yet or a score is missing. The row team's last digit selects the grid row
 * (via the row-digit assignment); the col team's selects the column.
 */
export function winningCell(grid: BoxesGridState, rowScore: number | null, colScore: number | null): Cell | null {
  const rd = lastDigit(rowScore);
  const cd = lastDigit(colScore);
  if (rd == null || cd == null || !digitsDrawn(grid)) return null;
  const row = grid.rowDigits.indexOf(rd);
  const col = grid.colDigits.indexOf(cd);
  if (row < 0 || col < 0) return null;
  return { row, col };
}

export function ownerAt(grid: BoxesGridState, cell: Cell | null): string | null {
  return cell ? grid.owners[cellKey(cell.row, cell.col)] ?? null : null;
}

export interface PeriodDef {
  key: string;
  label: string;
  weightPct: number; // this period's share of the pot
}

export interface PeriodScore {
  rowScore: number | null;
  colScore: number | null;
  final?: boolean; // the period has ended (locks the winner)
}

export interface PeriodOutcome extends PeriodDef {
  rowScore: number | null;
  colScore: number | null;
  cell: Cell | null;
  owner: string | null;
  amountCents: number;
  final: boolean;
}

/** Per-period winners + payouts. `potCents` is split by each period's weightPct. */
export function computePeriods(
  grid: BoxesGridState,
  potCents: number,
  periods: PeriodDef[],
  scores: Record<string, PeriodScore>,
): PeriodOutcome[] {
  return periods.map((p) => {
    const s = scores[p.key] ?? { rowScore: null, colScore: null };
    const cell = winningCell(grid, s.rowScore, s.colScore);
    return {
      ...p,
      rowScore: s.rowScore,
      colScore: s.colScore,
      cell,
      owner: ownerAt(grid, cell),
      amountCents: Math.round((potCents * p.weightPct) / 100),
      final: !!s.final,
    };
  });
}

/**
 * How the total pot divides across the games in a series. `equal` splits evenly;
 * `round_weighted` gives later games proportionally more (weight = position), good
 * for a tournament where the Final should pay more than Round 1. Leftover pennies
 * go to the heaviest games. (Custom per-game weights land later → treated as equal.)
 */
export function gamePotShares(gameCount: number, potCents: number, allocation: "equal" | "round_weighted" | "custom"): number[] {
  if (gameCount <= 0) return [];
  const weights =
    allocation === "round_weighted"
      ? Array.from({ length: gameCount }, (_, i) => i + 1)
      : Array.from({ length: gameCount }, () => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  const shares = weights.map((w) => Math.floor((potCents * w) / total));
  let rem = potCents - shares.reduce((a, b) => a + b, 0);
  const byWeightDesc = weights.map((_, i) => i).sort((a, b) => weights[b] - weights[a]);
  for (let k = 0; rem > 0; k++, rem--) shares[byWeightDesc[k % gameCount]] += 1;
  return shares;
}

/** A single game's pot split into its periods (dollars per period). */
export function periodPayouts(
  gamePotCents: number,
  periods: PeriodDef[],
  weights?: Record<string, number>,
): { key: string; label: string; cents: number }[] {
  return periods.map((p) => ({ key: p.key, label: p.label, cents: Math.round((gamePotCents * (weights?.[p.key] ?? p.weightPct)) / 100) }));
}

export interface GamePeriodResult {
  key: string;
  label: string;
  cell: Cell | null;
  ownerId: string | null;
  amountCents: number; // paid to ownerId this period (includes any carried-in money)
  scored: boolean;
}
export interface GamePayout {
  perPeriod: GamePeriodResult[];
  byOwner: Record<string, number>; // ownerId → cents won in this game
}

/**
 * Who gets paid what for ONE game — the carry-orphan-wins payout (#230).
 * `compute.owners` is keyed by OWNER ID (user id), `scores` is the cumulative
 * away/home score at each period end. Walks periods in order: an owned winner
 * takes their slice + any carry; an unowned (orphan) winner's slice carries to the
 * next owned period. If the final is orphaned with carry left, it splits evenly
 * among the game's winners (or, if nobody won, refunds pro-rata by squares).
 */
export function computeGamePayouts(
  compute: BoxesGridState,
  gamePotCents: number,
  periods: PeriodDef[],
  weights: Record<string, number> | undefined,
  scores: Record<string, { away: number | null; home: number | null } | null>,
): GamePayout {
  const byOwner: Record<string, number> = {};
  const perPeriod: GamePeriodResult[] = [];
  const winners = new Set<string>();
  let carry = 0;

  for (const p of periods) {
    const s = scores[p.key];
    const scored = !!s && s.away != null && s.home != null;
    const slice = Math.round((gamePotCents * (weights?.[p.key] ?? p.weightPct)) / 100);
    let cell: Cell | null = null;
    let ownerId: string | null = null;
    let amount = 0;
    if (scored) {
      cell = winningCell(compute, s!.away, s!.home);
      ownerId = ownerAt(compute, cell);
      if (ownerId) {
        amount = slice + carry;
        byOwner[ownerId] = (byOwner[ownerId] ?? 0) + amount;
        winners.add(ownerId);
        carry = 0;
      } else {
        carry += slice;
      }
    }
    perPeriod.push({ key: p.key, label: p.label, cell, ownerId, amountCents: amount, scored });
  }

  const allScored = periods.every((p) => {
    const s = scores[p.key];
    return s && s.away != null && s.home != null;
  });
  if (allScored && carry > 0) {
    const list = [...winners];
    if (list.length > 0) {
      const each = Math.floor(carry / list.length);
      let rem = carry - each * list.length;
      for (const w of list) {
        byOwner[w] = (byOwner[w] ?? 0) + each + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
      }
    } else {
      const counts: Record<string, number> = {};
      for (const k in compute.owners) {
        const o = compute.owners[k];
        if (o) counts[o] = (counts[o] ?? 0) + 1;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total > 0) for (const o of Object.keys(counts)) byOwner[o] = (byOwner[o] ?? 0) + Math.round((carry * counts[o]) / total);
    }
  }

  return { perPeriod, byOwner };
}

/** A fair random permutation of 0-9 for digit assignment (Fisher-Yates). */
export function drawDigits(rng: () => number = Math.random): number[] {
  const a = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Default period weights by game structure (admin-overridable). Quarters = NBA +
 * both footballs; halves = NCAA basketball. The structure comes from the league
 * (see LEAGUES in sports/espn.ts), never guessed from "basketball".
 */
export const PERIOD_PRESETS: Record<"halves" | "quarters", PeriodDef[]> = {
  quarters: [
    { key: "Q1", label: "Q1", weightPct: 15 },
    { key: "Half", label: "Half", weightPct: 25 },
    { key: "Q3", label: "Q3", weightPct: 15 },
    { key: "Final", label: "Final", weightPct: 45 },
  ],
  halves: [
    { key: "Half", label: "Half", weightPct: 40 },
    { key: "Final", label: "Final", weightPct: 60 },
  ],
};
