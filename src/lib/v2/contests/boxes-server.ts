import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Boxes create (#230). Builds a GROUP-scoped contest (event_id NULL,
 * org_id set) — a Boxes pool available to all members, beside the single active
 * event — plus its per-game rows (teams on the axes, from the ESPN picker) and
 * the 100 empty squares. Money (buy-in/payout) is layered on later; here we just
 * stand up the grid so people can claim squares.
 */

export interface BoxesGameInput {
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

export interface CreateBoxesInput {
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
  games: BoxesGameInput[];
  createdBy: string;
}

export async function createBoxesContest(admin: SupabaseClient, input: CreateBoxesInput): Promise<{ id: string }> {
  const { data: contest, error } = await admin
    .from("v2_contests")
    .insert({
      org_id: input.orgId,
      event_id: input.eventId ?? null, // NULL = group-scoped, set = event-scoped
      contest_type: "boxes",
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
        phase: "setup",
        ...(input.periodWeights ? { period_weights: input.periodWeights } : {}),
      },
      created_by: input.createdBy,
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
    const { error: gErr } = await admin.from("v2_boxes_games").insert(gameRows);
    if (gErr) throw new Error(gErr.message);
  }

  // Seed the 100 open squares in one batch.
  const cells: { contest_id: string; grid_row: number; grid_col: number }[] = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) cells.push({ contest_id: contest.id, grid_row: r, grid_col: c });
  const { error: cErr } = await admin.from("v2_boxes_cells").insert(cells);
  if (cErr) throw new Error(cErr.message);

  return { id: contest.id };
}

export interface UpdateBoxesInput {
  name?: string;
  cellCostCents?: number;
  potAllocation?: "equal" | "round_weighted" | "custom";
  periodWeights?: PeriodWeights;
  maxSquaresPrimary?: number;
  maxSquaresSecondary?: number | null;
  primaryEndsAt?: string | null;
  secondaryEndsAt?: string | null;
  games?: BoxesGameInput[]; // when present, the game set is REPLACED wholesale
}

/**
 * Edit/reconfigure an existing Boxes pool. Square ownership (the 100 cells) is
 * preserved — only the contest config and, optionally, the game set change. Games
 * are replaced wholesale; digits re-draw per game at lock, so swapping games in a
 * draft pool is safe.
 */
export async function updateBoxesContest(admin: SupabaseClient, contestId: string, patch: UpdateBoxesInput): Promise<void> {
  const { data: existing, error: readErr } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  if (readErr || !existing) throw new Error(readErr?.message ?? "Contest not found");

  const fields: Record<string, unknown> = {};
  if (patch.name != null) fields.name = patch.name;
  if (
    patch.cellCostCents != null ||
    patch.potAllocation != null ||
    patch.periodWeights != null ||
    patch.maxSquaresPrimary != null ||
    patch.maxSquaresSecondary !== undefined ||
    patch.primaryEndsAt !== undefined ||
    patch.secondaryEndsAt !== undefined
  ) {
    const cfg = { ...((existing.config as Record<string, unknown>) ?? {}) };
    if (patch.cellCostCents != null) cfg.cell_cost_cents = patch.cellCostCents;
    if (patch.potAllocation != null) cfg.pot_allocation = patch.potAllocation;
    if (patch.periodWeights != null) cfg.period_weights = patch.periodWeights;
    if (patch.maxSquaresPrimary != null) cfg.max_squares_primary = patch.maxSquaresPrimary;
    if (patch.maxSquaresSecondary !== undefined) cfg.max_squares_secondary = patch.maxSquaresSecondary;
    if (patch.primaryEndsAt !== undefined) cfg.primary_ends_at = patch.primaryEndsAt;
    if (patch.secondaryEndsAt !== undefined) cfg.secondary_ends_at = patch.secondaryEndsAt;
    fields.config = cfg;
  }
  if (Object.keys(fields).length) {
    const { error } = await admin.from("v2_contests").update(fields).eq("id", contestId);
    if (error) throw new Error(error.message);
  }

  if (patch.games) {
    const { error: delErr } = await admin.from("v2_boxes_games").delete().eq("contest_id", contestId);
    if (delErr) throw new Error(delErr.message);
    if (patch.games.length) {
      const rows = patch.games.map((g, i) => ({
        contest_id: contestId,
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
      const { error: insErr } = await admin.from("v2_boxes_games").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
  }
}
