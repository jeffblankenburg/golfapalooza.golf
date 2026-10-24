import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePayouts, computeGamePayoutsFromSlices, winningCell } from "@/lib/v2/contests/squares";
import { buildGameAllocations } from "@/lib/v2/contests/squares-alloc";
import { getLeague, fetchGameScore, periodScoresFromGame } from "@/lib/v2/sports/espn";
import { pickName, type NameMode } from "@/lib/v2/profile";
import SquaresManage, { type ManageGame, type PayoutRow, type GameWinner, type GameBox } from "./SquaresManage";
import type { SquaresContestRow } from "../SquaresEditor";

/**
 * Map a contest row + its games into the SquaresContestRow the editor expects.
 * Shared so the group hub list and the event edit launcher build it identically.
 */
export async function loadSquaresContestRow(
  supabase: SupabaseClient,
  contest: { id: string; name: string; status: string; config: unknown; collected_by?: string | null },
): Promise<SquaresContestRow> {
  const cfg = (contest.config as Record<string, unknown>) ?? {};
  const { data: gameRows } = await supabase
    .from("v2_squares_games")
    .select("espn_event_id, league, label, team_row, team_col, start_time, game_alloc, period_alloc, sort_order")
    .eq("contest_id", contest.id)
    .order("sort_order");
  return {
    id: contest.id,
    name: contest.name,
    status: contest.status,
    phase: (cfg.phase as string) ?? "setup",
    cellCostCents: (cfg.cell_cost_cents as number) ?? 0,
    potAllocation: (cfg.pot_allocation as SquaresContestRow["potAllocation"]) ?? "equal",
    periodWeights: (cfg.period_weights as SquaresContestRow["periodWeights"]) ?? {},
    maxSquaresPrimary: (cfg.max_squares_primary as number) ?? 10,
    maxSquaresSecondary: cfg.max_squares_secondary === undefined ? null : (cfg.max_squares_secondary as number | null),
    primaryEndsAt: (cfg.primary_ends_at as string | null) ?? null,
    secondaryEndsAt: (cfg.secondary_ends_at as string | null) ?? null,
    collectedBy: contest.collected_by ?? null,
    games: (gameRows ?? []).map((g) => ({
      espnEventId: g.espn_event_id as string,
      league: g.league as string,
      label: (g.label as string) ?? null,
      teamRow: (g.team_row as SquaresContestRow["games"][number]["teamRow"]) ?? null,
      teamCol: (g.team_col as SquaresContestRow["games"][number]["teamCol"]) ?? null,
      startTime: (g.start_time as string) ?? null,
      gameAlloc: (g.game_alloc as SquaresContestRow["games"][number]["gameAlloc"]) ?? null,
      periodAlloc: (g.period_alloc as SquaresContestRow["games"][number]["periodAlloc"]) ?? null,
    })),
  };
}

/**
 * Loads a Squares pool's manage data (grid, games, ESPN-scored payouts) and renders
 * SquaresManage. Scope-agnostic: the group and event manage pages both call this,
 * passing their own `base` (contest API root) + admin link hrefs. The data-loading
 * keys only off the contest id, so it's identical for either scope.
 */
export default async function SquaresManageView({
  supabase,
  contest,
  base,
  backHref,
  payoutsHref,
  playerHref,
  editHref,
  nameMode,
}: {
  supabase: SupabaseClient;
  contest: { id: string; name: string; status: string; config: unknown };
  base: string;
  backHref: string;
  payoutsHref: string;
  playerHref: string;
  editHref?: string;
  nameMode: NameMode;
}) {
  const contestId = contest.id;

  const { data: gameRows } = await supabase
    .from("v2_squares_games")
    .select("id, espn_event_id, league, label, team_row, team_col, row_digits, col_digits, locked_at, reveal_at, status, period_scores, game_alloc, period_alloc, start_time, sort_order")
    .eq("contest_id", contestId)
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order");

  const { data: cells } = await supabase
    .from("v2_squares_cells")
    .select("grid_row, grid_col, user_id")
    .eq("contest_id", contestId);

  // Per-game paid state (one row per pool, member, game).
  const { data: paidRows } = await supabase
    .from("v2_squares_payouts")
    .select("user_id, game_id, paid_cents, note")
    .eq("contest_id", contestId);
  const paidByGameUser = new Map<string, { cents: number; note: string | null }>();
  for (const r of paidRows ?? []) paidByGameUser.set(`${r.game_id}:${r.user_id}`, { cents: (r.paid_cents as number) ?? 0, note: (r.note as string) ?? null });

  // Owner names + payout handles for any claimed squares.
  const ownerIds = [...new Set((cells ?? []).map((c) => c.user_id).filter((x): x is string => !!x))];
  const { data: profiles } = ownerIds.length
    ? await supabase.from("v2_profiles").select("id, display_name, first_name, last_name, venmo_username, paypal_username").in("id", ownerIds)
    : { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; venmo_username: string | null; paypal_username: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, pickName(p, nameMode)]));
  const venmoById = new Map((profiles ?? []).map((p) => [p.id, (p.venmo_username as string | null) ?? null]));
  const paypalById = new Map((profiles ?? []).map((p) => [p.id, (p.paypal_username as string | null) ?? null]));

  // Entry-paid per owner (squares × cost vs ledger payments) — flags winners who
  // haven't settled their own buy-in, so you can collect before paying out.
  const squaresByUser = new Map<string, number>();
  for (const c of cells ?? []) if (c.user_id) squaresByUser.set(c.user_id as string, (squaresByUser.get(c.user_id as string) || 0) + 1);
  const cellCostForEntry = ((contest.config as { cell_cost_cents?: number } | null)?.cell_cost_cents) ?? 0;
  const { data: entryPays } = ownerIds.length
    ? await supabase.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment")
    : { data: [] as { user_id: string; amount_cents: number }[] };
  const entryPaidByUser = new Map<string, number>();
  for (const p of entryPays ?? []) entryPaidByUser.set(p.user_id as string, (entryPaidByUser.get(p.user_id as string) || 0) + ((p.amount_cents as number) || 0));
  const entryPaidFor = (uid: string) => {
    const owed = (squaresByUser.get(uid) || 0) * cellCostForEntry;
    return owed <= 0 || (entryPaidByUser.get(uid) || 0) >= owed;
  };

  const owners: Record<string, string> = {};
  for (const c of cells ?? []) if (c.user_id) owners[`${c.grid_row},${c.grid_col}`] = nameById.get(c.user_id) || "Member";
  const claimed = (cells ?? []).filter((c) => c.user_id).length;

  const games: ManageGame[] = (gameRows ?? []).map((g) => ({
    id: g.id as string,
    label: (g.label as string) ?? "Game",
    league: g.league as string,
    teamRow: (g.team_row as ManageGame["teamRow"]) ?? null,
    teamCol: (g.team_col as ManageGame["teamCol"]) ?? null,
    rowDigits: (g.row_digits as number[]) ?? [],
    colDigits: (g.col_digits as number[]) ?? [],
    locked: !!g.locked_at,
    revealAt: (g.reveal_at as string) ?? null,
    startTime: (g.start_time as string) ?? null,
    final: (g.status as string) === "final",
    gameAlloc: (g.game_alloc as ManageGame["gameAlloc"]) ?? null,
    periodAlloc: (g.period_alloc as ManageGame["periodAlloc"]) ?? null,
  }));

  const cfg = (contest.config as Record<string, unknown>) ?? {};

  // Payout sheet — auto-scored from ESPN (payouts are paid MANUALLY by the admin).
  // Fetch each locked game's live/final scores, compute winners + amounts (carry
  // rules), and aggregate what to pay each person.
  const ownerById: Record<string, string> = {};
  for (const c of cells ?? []) if (c.user_id) ownerById[`${c.grid_row},${c.grid_col}`] = c.user_id;

  const potCents = claimed * ((cfg.cell_cost_cents as number) ?? 0);
  // Resolve the flexible $/%/remainder allocations once for the whole pool, then
  // feed each game its per-period dollar slices.
  const allocGames = buildGameAllocations(
    (gameRows ?? []).map((g) => ({ id: g.id as string, league: g.league as string, game_alloc: g.game_alloc, period_alloc: g.period_alloc })),
    potCents,
    { potAllocation: (cfg.pot_allocation as "equal" | "round_weighted" | "custom") ?? "equal", periodWeights: (cfg.period_weights as Record<string, Record<string, number>>) ?? {} },
  );
  const slicesByGame = new Map(resolvePayouts(potCents, allocGames).games.map((rg) => [rg.key, rg.periods]));

  // Payouts PER GAME — each row is a person's take for that one game (lines broken
  // out by period), plus how much of it is already paid. `winnersByGame` carries
  // the squares to highlight on each game's board.
  const payoutsByGame: Record<string, PayoutRow[]> = {};
  const winnersByGame: Record<string, GameWinner[]> = {};
  const scoresByGame: Record<string, GameBox> = {};
  const scoredGameIds: string[] = [];
  for (let i = 0; i < (gameRows ?? []).length; i++) {
    const g = gameRows![i];
    if (!g.locked_at) continue;
    const structure = getLeague(g.league as string)?.periods;
    if (structure !== "quarters" && structure !== "halves") continue;
    // Prefer the scores the cron cached; fall back to a live fetch if it hasn't
    // run for this game yet (e.g. just locked).
    let ps = (g.period_scores as Record<string, { away: number | null; home: number | null } | null> | null) ?? null;
    if (!ps && g.espn_event_id) {
      const score = await fetchGameScore(g.league as string, g.espn_event_id as string);
      if (score) ps = periodScoresFromGame(score, structure);
    }
    if (!ps) continue;
    if (Object.values(ps).some((v) => v)) scoredGameIds.push(g.id as string);
    const gridState = { owners: ownerById, rowDigits: (g.row_digits as number[]) ?? [], colDigits: (g.col_digits as number[]) ?? [] };
    const slices = slicesByGame.get(g.id as string) ?? [];

    // Winning squares for the board highlight: any scored period with a drawn
    // cell, badged with that period's slice value (matches the player board).
    const winners: GameWinner[] = [];
    for (const slice of slices) {
      const sc = ps[slice.key];
      if (sc && sc.away != null && sc.home != null) {
        const cell = winningCell(gridState, sc.away, sc.home);
        if (cell) winners.push({ cell, label: slice.label, amountCents: slice.cents });
      }
    }
    winnersByGame[g.id as string] = winners;

    // Box score under the grid: our checkpoints are CUMULATIVE scores, so each
    // period's points = this checkpoint minus the last, and the running total is
    // the checkpoint itself (its last digit is what picks the winning square).
    const periodKeys = structure === "quarters" ? ["Q1", "Half", "Q3", "Final"] : ["Half", "Final"];
    const cols = structure === "quarters" ? ["Q1", "Q2", "Q3", "Q4"] : ["1H", "2H"];
    const awayCum = periodKeys.map((k) => ps![k]?.away ?? null);
    const homeCum = periodKeys.map((k) => ps![k]?.home ?? null);
    const toPts = (cum: (number | null)[]) => cum.map((v, j) => (v == null ? null : v - (j === 0 ? 0 : cum[j - 1] ?? 0)));
    if (awayCum.some((v) => v != null) || homeCum.some((v) => v != null)) {
      scoresByGame[g.id as string] = {
        cols,
        away: { abbrev: (g.team_row as { abbrev?: string } | null)?.abbrev ?? "AWY", pts: toPts(awayCum), cum: awayCum, total: ps.Final?.away ?? null },
        home: { abbrev: (g.team_col as { abbrev?: string } | null)?.abbrev ?? "HOM", pts: toPts(homeCum), cum: homeCum, total: ps.Final?.home ?? null },
      };
    }

    const payout = computeGamePayoutsFromSlices(gridState, slices, ps);
    const per: Record<string, { total: number; lines: { label: string; amountCents: number }[] }> = {};
    for (const [uid, cents] of Object.entries(payout.byOwner)) per[uid] = { total: cents, lines: [] };
    for (const pr of payout.perPeriod) {
      if (pr.ownerId && pr.amountCents > 0) (per[pr.ownerId] ??= { total: 0, lines: [] }).lines.push({ label: pr.label, amountCents: pr.amountCents });
    }
    payoutsByGame[g.id as string] = Object.entries(per)
      .map(([uid, v]) => {
        const paid = paidByGameUser.get(`${g.id}:${uid}`);
        return { userId: uid, name: nameById.get(uid) || "Member", totalCents: v.total, paidCents: paid?.cents ?? 0, note: paid?.note ?? null, lines: v.lines, venmo: venmoById.get(uid) ?? null, paypal: paypalById.get(uid) ?? null, entryPaid: entryPaidFor(uid) };
      })
      .sort((a, b) => b.totalCents - a.totalCents);
  }

  return (
    <SquaresManage
      base={base}
      backHref={backHref}
      payoutsHref={payoutsHref}
      playerHref={playerHref}
      editHref={editHref}
      name={contest.name}
      phase={(cfg.phase as string) ?? "setup"}
      cellCostCents={(cfg.cell_cost_cents as number) ?? 0}
      games={games}
      owners={owners}
      claimed={claimed}
      payoutsByGame={payoutsByGame}
      winnersByGame={winnersByGame}
      scoresByGame={scoresByGame}
      scoredGameIds={scoredGameIds}
    />
  );
}
