import type { SupabaseClient } from "@supabase/supabase-js";
import { validateSquaresTimeline } from "./squares";

/** How many minutes before kickoff a pool draws its numbers, reading the current
 *  `reveal_lead_minutes` with back-compat for the legacy day-granularity field. */
export function revealLeadMinutesOf(cfg: Record<string, unknown> | null | undefined): number {
  const c = cfg ?? {};
  if (Number.isFinite(c.reveal_lead_minutes)) return c.reveal_lead_minutes as number;
  if (Number.isFinite(c.reveal_lead_days)) return (c.reveal_lead_days as number) * 1440;
  return 10080; // 7 days
}

/**
 * Server-side Squares create (#230). Builds a GROUP-scoped contest (event_id NULL,
 * org_id set) — a Squares pool available to all members, beside the single active
 * event — plus its per-game rows (teams on the axes, from the ESPN picker) and
 * the 100 empty squares. Money (buy-in/payout) is layered on later; here we just
 * stand up the grid so people can claim squares.
 */

export interface SquaresGameInput {
  espnEventId: string;
  league: string;
  label?: string | null;
  teamRow: Record<string, unknown>; // { name, abbrev, espn_id, logo, color }
  teamCol: Record<string, unknown>;
  gameWeight?: number;
  startTime?: string | null; // ESPN kickoff (ISO); gates the scores cron
  gameAlloc?: unknown; // { kind: 'amount'|'percent'|'remainder', value } — this game's cut of the pot
  periodAlloc?: unknown; // { periodKey: {kind,value} } — that cut, split across periods
}

// Per-period payout split, keyed by game structure ("quarters" | "halves") so a
// mixed-sport pool can weight each correctly. Each inner map is periodKey → %.
export type PeriodWeights = Record<string, Record<string, number>>;

export interface CreateSquaresInput {
  orgId: string;
  eventId?: string | null; // NULL/omitted = group-scoped; set = event-scoped
  name: string;
  cellCostCents: number;
  potAllocation: "equal" | "round_weighted" | "custom";
  periodWeights?: PeriodWeights;
  maxSquaresPrimary: number; // per-person cap in the primary draft
  maxSquaresSecondary: number | null; // secondary draft cap; null = unlimited
  primaryEndsAt?: string | null; // ISO; primary draft ends → secondary begins
  secondaryEndsAt?: string | null; // ISO; secondary auto-closes (null = until admin closes)
  revealLeadMinutes?: number; // draw each game's numbers this many minutes before its kickoff
  games: SquaresGameInput[];
  createdBy: string;
  collectedBy?: string | null; // who members settle the buy-in with (default: creator)
}

export async function createSquaresContest(admin: SupabaseClient, input: CreateSquaresInput): Promise<{ id: string }> {
  const timelineErr = validateSquaresTimeline({
    primaryEndsAt: input.primaryEndsAt ?? null,
    secondaryEndsAt: input.secondaryEndsAt ?? null,
    revealLeadMinutes: Number.isFinite(input.revealLeadMinutes) ? (input.revealLeadMinutes as number) : 10080,
    gameStartTimes: input.games.map((g) => g.startTime),
  });
  if (timelineErr) throw new Error(timelineErr);

  const { data: contest, error } = await admin
    .from("v2_contests")
    .insert({
      org_id: input.orgId,
      event_id: input.eventId ?? null, // NULL = group-scoped, set = event-scoped
      contest_type: "squares",
      name: input.name,
      scoring_source: "derived", // graded from ESPN period scores
      status: "draft",
      auto_enroll: false, // opt-in: you buy squares
      config: {
        cell_cost_cents: input.cellCostCents,
        pot_allocation: input.potAllocation,
        max_squares_primary: input.maxSquaresPrimary,
        max_squares_secondary: input.maxSquaresSecondary,
        primary_ends_at: input.primaryEndsAt ?? null,
        secondary_ends_at: input.secondaryEndsAt ?? null,
        reveal_lead_minutes: Number.isFinite(input.revealLeadMinutes) ? input.revealLeadMinutes : 10080, // default 7 days
        phase: "setup",
        ...(input.periodWeights ? { period_weights: input.periodWeights } : {}),
      },
      created_by: input.createdBy,
      collected_by: input.collectedBy ?? null,
    })
    .select("id")
    .single();
  if (error || !contest) throw new Error(error?.message ?? "Could not create the contest");

  if (input.games.length) {
    const gameRows = input.games.map((g, i) => ({
      contest_id: contest.id,
      espn_event_id: g.espnEventId,
      league: g.league,
      label: g.label ?? null,
      sort_order: i,
      team_row: g.teamRow,
      team_col: g.teamCol,
      game_weight: g.gameWeight ?? 1,
      start_time: g.startTime || null,
      game_alloc: g.gameAlloc ?? null,
      period_alloc: g.periodAlloc ?? null,
    }));
    const { error: gErr } = await admin.from("v2_squares_games").insert(gameRows);
    if (gErr) throw new Error(gErr.message);
  }

  // Seed the 100 open squares in one batch.
  const cells: { contest_id: string; grid_row: number; grid_col: number }[] = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push({ contest_id: contest.id, grid_row: r, grid_col: c });
  const { error: cErr } = await admin.from("v2_squares_cells").insert(cells);
  if (cErr) throw new Error(cErr.message);

  return { id: contest.id };
}

export interface UpdateSquaresInput {
  name?: string;
  cellCostCents?: number;
  potAllocation?: "equal" | "round_weighted" | "custom";
  periodWeights?: PeriodWeights;
  maxSquaresPrimary?: number;
  maxSquaresSecondary?: number | null;
  primaryEndsAt?: string | null;
  secondaryEndsAt?: string | null;
  revealLeadMinutes?: number;
  games?: SquaresGameInput[]; // when present, the game set is REPLACED wholesale
}

/**
 * Edit/reconfigure an existing Squares pool. Square ownership (the 100 cells) is
 * preserved. The game set is MERGED, not replaced: games that stay keep their
 * already-revealed numbers + reveal schedule (matched by ESPN id / matchup), newly
 * added games get their reveal scheduled if the board is already locked, and only
 * games the admin actually removed are deleted. (Previously this deleted + recreated
 * every game, silently wiping revealed numbers + reveal times on a locked pool.)
 */
export async function updateSquaresContest(admin: SupabaseClient, contestId: string, patch: UpdateSquaresInput): Promise<void> {
  const { data: existing, error: readErr } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  if (readErr || !existing) throw new Error(readErr?.message ?? "Contest not found");

  // The price is immutable once squares are owned — changing it would scramble the
  // per-member ledger. Admins must clear all picks (back to setup) to reprice.
  if (patch.cellCostCents != null && patch.cellCostCents !== ((existing.config as Record<string, unknown>)?.cell_cost_cents ?? 0)) {
    const { count } = await admin.from("v2_squares_cells").select("id", { count: "exact", head: true }).eq("contest_id", contestId).not("user_id", "is", null);
    if ((count ?? 0) > 0) throw new Error("Squares are already claimed — clear all picks before changing the price.");
  }

  // Enforce the chronological schedule on the RESULTING state (merge patch over
  // existing), so a games-only edit that drags a kickoff earlier is caught too.
  const cfg0 = (existing.config as Record<string, unknown>) ?? {};
  if (patch.primaryEndsAt !== undefined || patch.secondaryEndsAt !== undefined || patch.revealLeadMinutes !== undefined || patch.games !== undefined) {
    const mPrimary = patch.primaryEndsAt !== undefined ? patch.primaryEndsAt : ((cfg0.primary_ends_at as string | null) ?? null);
    const mSecondary = patch.secondaryEndsAt !== undefined ? patch.secondaryEndsAt : ((cfg0.secondary_ends_at as string | null) ?? null);
    const mLead = patch.revealLeadMinutes !== undefined ? patch.revealLeadMinutes : revealLeadMinutesOf(cfg0);
    let starts: (string | null | undefined)[];
    if (patch.games) {
      starts = patch.games.map((g) => g.startTime ?? null);
    } else {
      const { data: gs } = await admin.from("v2_squares_games").select("start_time").eq("contest_id", contestId);
      starts = (gs ?? []).map((g) => g.start_time as string | null);
    }
    const timelineErr = validateSquaresTimeline({ primaryEndsAt: mPrimary, secondaryEndsAt: mSecondary, revealLeadMinutes: mLead, gameStartTimes: starts });
    if (timelineErr) throw new Error(timelineErr);
  }

  const fields: Record<string, unknown> = {};
  if (patch.name != null) fields.name = patch.name;
  if (
    patch.cellCostCents != null ||
    patch.potAllocation != null ||
    patch.periodWeights != null ||
    patch.maxSquaresPrimary != null ||
    patch.maxSquaresSecondary !== undefined ||
    patch.primaryEndsAt !== undefined ||
    patch.secondaryEndsAt !== undefined ||
    patch.revealLeadMinutes !== undefined
  ) {
    const cfg = { ...((existing.config as Record<string, unknown>) ?? {}) };
    if (patch.cellCostCents != null) cfg.cell_cost_cents = patch.cellCostCents;
    if (patch.potAllocation != null) cfg.pot_allocation = patch.potAllocation;
    if (patch.periodWeights != null) cfg.period_weights = patch.periodWeights;
    if (patch.maxSquaresPrimary != null) cfg.max_squares_primary = patch.maxSquaresPrimary;
    if (patch.maxSquaresSecondary !== undefined) cfg.max_squares_secondary = patch.maxSquaresSecondary;
    if (patch.primaryEndsAt !== undefined) cfg.primary_ends_at = patch.primaryEndsAt;
    if (patch.secondaryEndsAt !== undefined) cfg.secondary_ends_at = patch.secondaryEndsAt;
    if (patch.revealLeadMinutes !== undefined) cfg.reveal_lead_minutes = patch.revealLeadMinutes;
    fields.config = cfg;
  }
  if (Object.keys(fields).length) {
    const { error } = await admin.from("v2_contests").update(fields).eq("id", contestId);
    if (error) throw new Error(error.message);
  }

  if (patch.games) {
    const cfg = (existing.config as Record<string, unknown>) ?? {};
    const boardLocked = cfg.phase === "locked" || cfg.phase === "final" || !!cfg.board_locked_at;
    const leadMinutes = revealLeadMinutesOf(cfg);
    // Reveal time for a game on a LOCKED board = kickoff − reveal lead (null otherwise:
    // a draft board schedules reveals at lock_board, not here).
    const revealFor = (startTime: string | null): string | null =>
      boardLocked && startTime ? new Date(new Date(startTime).getTime() - leadMinutes * 60000).toISOString() : null;

    const { data: existingGames } = await admin
      .from("v2_squares_games")
      .select("id, espn_event_id, label, start_time, locked_at")
      .eq("contest_id", contestId);
    // Match on ESPN id when present (stable), else the matchup label + kickoff.
    const keyOf = (espn: string | null | undefined, label: string | null | undefined, start: string | null | undefined) =>
      espn || `${label ?? ""}|${start ?? ""}`;
    const existingByKey = new Map((existingGames ?? []).map((g) => [keyOf(g.espn_event_id as string, g.label as string, g.start_time as string), g]));
    const usedIds = new Set<string>();

    for (let i = 0; i < patch.games.length; i++) {
      const g = patch.games[i];
      const base = {
        espn_event_id: g.espnEventId,
        league: g.league,
        label: g.label ?? null,
        sort_order: i,
        team_row: g.teamRow,
        team_col: g.teamCol,
        game_weight: g.gameWeight ?? 1,
        start_time: g.startTime || null,
        game_alloc: g.gameAlloc ?? null,
        period_alloc: g.periodAlloc ?? null,
      };
      const match = existingByKey.get(keyOf(g.espnEventId, g.label, g.startTime || null));
      if (match) {
        usedIds.add(match.id as string);
        // Update editable fields; PRESERVE locked_at / row_digits / col_digits /
        // reveal_at. Only reschedule the reveal if the kickoff moved and it hasn't
        // been revealed yet.
        const update: Record<string, unknown> = { ...base };
        if (!match.locked_at && (match.start_time as string | null) !== (g.startTime || null)) {
          update.reveal_at = revealFor(g.startTime || null);
        }
        const { error } = await admin.from("v2_squares_games").update(update).eq("id", match.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await admin.from("v2_squares_games").insert({ contest_id: contestId, ...base, reveal_at: revealFor(g.startTime || null) });
        if (error) throw new Error(error.message);
      }
    }

    // Delete only the games the admin removed from the slate.
    const toDelete = (existingGames ?? []).map((g) => g.id as string).filter((id) => !usedIds.has(id));
    if (toDelete.length) {
      const { error } = await admin.from("v2_squares_games").delete().in("id", toDelete);
      if (error) throw new Error(error.message);
    }
  }
}
