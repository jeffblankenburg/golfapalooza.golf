/**
 * Squares payout allocation bridge (#230). Turns stored game rows into the
 * `GameAllocation[]` the flexible engine (resolvePayouts) consumes — preferring
 * each game's explicit `game_alloc` / `period_alloc`, and falling back to the
 * legacy per-structure percentage config (pot_allocation + period_weights) when a
 * game predates the flexible editor. ONE place owns the old→new translation so the
 * editor preview, the member board, and the payout sheet never diverge.
 */
import {
  type Alloc,
  type GameAllocation,
  PERIOD_PRESETS,
  gamePotShares,
} from "./squares";
import { getLeague, type PeriodStructure } from "../sports/espn";

export interface SquaresGameLike {
  id: string;
  league: string;
  game_alloc?: unknown;
  period_alloc?: unknown;
}

export interface LegacyPayoutConfig {
  potAllocation: "equal" | "round_weighted" | "custom";
  periodWeights: Record<string, Record<string, number>>; // { quarters: {Q1:..}, halves: {..} }
}

function asAlloc(v: unknown): Alloc | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { kind?: unknown; value?: unknown };
  if (o.kind === "remainder") return { kind: "remainder", value: 0 };
  if ((o.kind === "amount" || o.kind === "percent") && typeof o.value === "number") {
    return { kind: o.kind, value: o.value };
  }
  return null;
}

function structureOf(league: string): PeriodStructure | null {
  const p = getLeague(league)?.periods;
  return p === "quarters" || p === "halves" ? p : null;
}

/**
 * Build `GameAllocation[]` (game-level + per-period allocs) for a pool's games.
 * `potCents` is only needed to translate the legacy pot split into per-game
 * `amount`s; flexible games ignore it.
 */
export function buildGameAllocations(games: SquaresGameLike[], potCents: number, legacy: LegacyPayoutConfig): GameAllocation[] {
  // Legacy per-game pot shares (used only when a game has no explicit game_alloc).
  const legacyShares = gamePotShares(games.length, potCents, legacy.potAllocation);

  return games.map((g, i) => {
    const structure = structureOf(g.league);
    const presetPeriods = structure ? PERIOD_PRESETS[structure] : [];

    // Game-level allocation: explicit, else a fixed legacy share of the pot.
    const explicitGame = asAlloc(g.game_alloc);
    const game: Alloc = explicitGame ?? { kind: "amount", value: legacyShares[i] ?? 0 };

    // Period-level allocations: explicit per-period, else legacy percentages.
    const explicitPeriods = (g.period_alloc && typeof g.period_alloc === "object" ? (g.period_alloc as Record<string, unknown>) : null);
    const legacyWeights = structure ? legacy.periodWeights[structure] : undefined;
    const periods = presetPeriods.map((p) => {
      const ex = explicitPeriods ? asAlloc(explicitPeriods[p.key]) : null;
      const pct = legacyWeights?.[p.key] ?? p.weightPct;
      return { key: p.key, label: p.label, alloc: ex ?? ({ kind: "percent", value: pct } as Alloc) };
    });

    return { key: g.id, game, periods };
  });
}
