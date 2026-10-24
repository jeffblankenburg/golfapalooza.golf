import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePayouts, computeGamePayoutsFromSlices } from "@/lib/v2/contests/squares";
import { buildGameAllocations } from "@/lib/v2/contests/squares-alloc";
import { getLeague, fetchGameScore, periodScoresFromGame } from "@/lib/v2/sports/espn";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { type PayoutPerson } from "./MasterPayouts";

/**
 * Pool-wide master payouts: who won how much across every scored game, with their
 * paid total + payment info. Shared by the standalone Payouts page and the detail
 * page's bottom collapsible. Server-only (ESPN fetches + service/user supabase).
 */
export async function loadMasterPayouts(
  supabase: SupabaseClient,
  contestId: string,
  config: Record<string, unknown>,
  nameMode: NameMode,
): Promise<PayoutPerson[]> {
  const [{ data: gameRows }, { data: cells }, { data: paidRows }] = await Promise.all([
    supabase.from("v2_squares_games").select("id, espn_event_id, league, label, row_digits, col_digits, locked_at, period_scores, game_alloc, period_alloc").eq("contest_id", contestId).order("start_time", { ascending: true, nullsFirst: false }).order("sort_order"),
    supabase.from("v2_squares_cells").select("grid_row, grid_col, user_id").eq("contest_id", contestId),
    supabase.from("v2_squares_payouts").select("user_id, game_id, paid_cents, note").eq("contest_id", contestId),
  ]);

  const ownerById: Record<string, string> = {};
  for (const c of cells ?? []) if (c.user_id) ownerById[`${c.grid_row},${c.grid_col}`] = c.user_id;
  const claimed = (cells ?? []).filter((c) => c.user_id).length;
  const potCents = claimed * ((config.cell_cost_cents as number) ?? 0);

  const allocGames = buildGameAllocations(
    (gameRows ?? []).map((g) => ({ id: g.id as string, league: g.league as string, game_alloc: g.game_alloc, period_alloc: g.period_alloc })),
    potCents,
    { potAllocation: (config.pot_allocation as "equal" | "round_weighted" | "custom") ?? "equal", periodWeights: (config.period_weights as Record<string, Record<string, number>>) ?? {} },
  );
  const slicesByGame = new Map(resolvePayouts(potCents, allocGames).games.map((rg) => [rg.key, rg.periods]));

  const won: Record<string, { total: number; lines: { label: string; amountCents: number }[] }> = {};
  const wonByGame: Record<string, Record<string, number>> = {};
  for (const g of gameRows ?? []) {
    if (!g.locked_at) continue;
    const structure = getLeague(g.league as string)?.periods;
    if (structure !== "quarters" && structure !== "halves") continue;
    let ps = (g.period_scores as Record<string, { away: number | null; home: number | null } | null> | null) ?? null;
    if (!ps && g.espn_event_id) {
      const score = await fetchGameScore(g.league as string, g.espn_event_id as string);
      if (score) ps = periodScoresFromGame(score, structure);
    }
    if (!ps) continue;
    const payout = computeGamePayoutsFromSlices(
      { owners: ownerById, rowDigits: (g.row_digits as number[]) ?? [], colDigits: (g.col_digits as number[]) ?? [] },
      slicesByGame.get(g.id as string) ?? [],
      ps,
    );
    for (const pr of payout.perPeriod) {
      if (pr.ownerId && pr.amountCents > 0) {
        (won[pr.ownerId] ??= { total: 0, lines: [] }).total += pr.amountCents;
        won[pr.ownerId].lines.push({ label: `${g.label} ${pr.label}`, amountCents: pr.amountCents });
        const gw = (wonByGame[pr.ownerId] ??= {});
        gw[g.id as string] = (gw[g.id as string] ?? 0) + pr.amountCents;
      }
    }
  }

  // Entry-paid per winner (squares × cost vs ledger payments) — flags winners who
  // haven't settled their own buy-in yet.
  const squaresByUser = new Map<string, number>();
  for (const c of cells ?? []) if (c.user_id) squaresByUser.set(c.user_id as string, (squaresByUser.get(c.user_id as string) || 0) + 1);
  const cellCostForEntry = (config.cell_cost_cents as number) ?? 0;
  const { data: entryPays } = await supabase.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("source", "deposit");
  const entryPaidByUser = new Map<string, number>();
  for (const p of entryPays ?? []) entryPaidByUser.set(p.user_id as string, (entryPaidByUser.get(p.user_id as string) || 0) + ((p.amount_cents as number) || 0));
  const entryPaidFor = (uid: string) => {
    const owed = (squaresByUser.get(uid) || 0) * cellCostForEntry;
    return owed <= 0 || (entryPaidByUser.get(uid) || 0) >= owed;
  };

  const winnerIds = Object.keys(won);
  const { data: profiles } = winnerIds.length
    ? await supabase.from("v2_profiles").select("id, display_name, first_name, last_name, venmo_username, paypal_username, mailing_address").in("id", winnerIds)
    : { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; venmo_username: string | null; paypal_username: string | null; mailing_address: string | null }[] };
  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const paidById = new Map<string, { cents: number; note: string | null }>();
  for (const r of paidRows ?? []) {
    const cur = paidById.get(r.user_id as string) ?? { cents: 0, note: null };
    cur.cents += (r.paid_cents as number) ?? 0;
    if (!cur.note && r.note) cur.note = r.note as string;
    paidById.set(r.user_id as string, cur);
  }

  return winnerIds
    .map((uid) => {
      const p = profById.get(uid);
      const paid = paidById.get(uid);
      return {
        userId: uid,
        name: pickName(p, nameMode),
        wonCents: won[uid].total,
        paidCents: paid?.cents ?? 0,
        note: paid?.note ?? null,
        venmo: p?.venmo_username ?? null,
        paypal: p?.paypal_username ?? null,
        address: p?.mailing_address ?? null,
        lines: won[uid].lines,
        games: Object.entries(wonByGame[uid] ?? {}).map(([gameId, wonCents]) => ({ gameId, wonCents })),
        entryPaid: entryPaidFor(uid),
      };
    })
    .sort((a, b) => b.wonCents - a.wonCents);
}
