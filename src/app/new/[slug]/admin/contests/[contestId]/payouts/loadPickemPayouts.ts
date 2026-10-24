import type { SupabaseClient } from "@supabase/supabase-js";
import { rankPickem, gameIsScored, computePickemPayouts, type PickemGame, type PickemPick, type PayoutSplit } from "@/lib/v2/contests/pickem";
import { splitAmongMembers } from "@/lib/v2/contests/payouts";
import { pickName, type NameMode } from "@/lib/v2/profile";

/**
 * Pick'em master payouts: who won how much by LEADERBOARD PLACE once the slate is
 * fully scored, with each winner's settled total + payment info + an entry-unpaid
 * flag. Winnings resolve from the pot (entry × entrants) × payout_splits; ties for a
 * place pool the places they occupy and split evenly (cent-exact). A winner's settled
 * total sums EXTERNAL cash-outs (v2_pickem_payouts) and "apply to account" credits
 * (source='winnings' ledger rows). Server-only.
 */
export interface PickemPayoutPerson {
  userId: string;
  name: string;
  place: number;
  correct: number;
  wonCents: number;
  paidCents: number;
  method: string | null;   // how the external cash-out was recorded, if any
  note: string | null;
  appliedToAccount: boolean; // a source='winnings' credit exists for them
  venmo: string | null;
  paypal: string | null;
  address: string | null;
  entryPaid: boolean;      // false = this winner hasn't settled their own buy-in
}

export interface PickemPayouts {
  ready: boolean;        // true once every game is scored (safe to pay)
  potCents: number;
  people: PickemPayoutPerson[];
}

export async function loadPickemPayouts(
  supabase: SupabaseClient,
  contestId: string,
  contest: { config: Record<string, unknown> | null; payout_splits: PayoutSplit[] | null; collected_by?: string | null; created_by?: string | null },
  nameMode: NameMode,
): Promise<PickemPayouts> {
  const [{ data: gameRows }, { data: parts }] = await Promise.all([
    supabase.from("v2_pickem_games").select("id, away_team, home_team, spread, favorite, away_score, home_score, winning_team, is_tiebreaker, game_time, sort_order").eq("contest_id", contestId).order("sort_order"),
    supabase.from("v2_contest_participants").select("user_id").eq("contest_id", contestId),
  ]);
  const games = (gameRows ?? []) as unknown as PickemGame[];
  const gameIds = games.map((g) => g.id);
  const { data: pickRows } = gameIds.length
    ? await supabase.from("v2_pickem_picks").select("game_id, user_id, picked_team, tiebreaker_total").in("game_id", gameIds)
    : { data: [] as PickemPick[] };
  const picks = (pickRows ?? []) as PickemPick[];

  const entryCents = Number((contest.config as { entry_cents?: number } | null)?.entry_cents) || 0;
  const entrantCount = (parts ?? []).length;
  const potCents = entryCents * entrantCount;

  const ready = games.length > 0 && games.every(gameIsScored);
  const placePayouts = computePickemPayouts(potCents, contest.payout_splits);
  const amountForPlace = new Map(placePayouts.map((p) => [p.place, p.amountCents]));

  // Won cents per user: group the ranked board by rank; a rank held by k players
  // occupies places [rank, rank+k-1] — pool those place amounts and split evenly.
  const wonByUser = new Map<string, number>();
  const placeByUser = new Map<string, number>();
  const correctByUser = new Map<string, number>();
  if (ready && potCents > 0 && placePayouts.length > 0) {
    const ranked = rankPickem(games, picks);
    for (const r of ranked) { placeByUser.set(r.userId, r.rank); correctByUser.set(r.userId, r.correct); }
    // Walk distinct rank groups in board order.
    let i = 0;
    while (i < ranked.length) {
      const rank = ranked[i].rank;
      const group: string[] = [];
      let j = i;
      while (j < ranked.length && ranked[j].rank === rank) { group.push(ranked[j].userId); j++; }
      const total = group.reduce((s, _u, k) => s + (amountForPlace.get(rank + k) ?? 0), 0);
      if (total > 0) {
        const shares = splitAmongMembers(total, group.length);
        group.forEach((uid, k) => wonByUser.set(uid, shares[k]));
      }
      i = j;
    }
  }

  const winnerIds = [...wonByUser.keys()].filter((uid) => (wonByUser.get(uid) || 0) > 0);
  if (winnerIds.length === 0) return { ready, potCents, people: [] };

  // Settled totals: external cash-outs (v2_pickem_payouts) + apply-to-account credits.
  const [{ data: payouts }, { data: credits }, { data: entryPays }, { data: profiles }] = await Promise.all([
    supabase.from("v2_pickem_payouts").select("user_id, paid_cents, method, note").eq("contest_id", contestId),
    supabase.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("source", "winnings"),
    supabase.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("source", "deposit"),
    supabase.from("v2_profiles").select("id, display_name, first_name, last_name, nickname, venmo_username, paypal_username, mailing_address").in("id", winnerIds),
  ]);

  const extById = new Map<string, { cents: number; method: string | null; note: string | null }>();
  for (const r of payouts ?? []) {
    const cur = extById.get(r.user_id as string) ?? { cents: 0, method: null, note: null };
    cur.cents += (r.paid_cents as number) || 0;
    if (!cur.method && r.method) cur.method = r.method as string;
    if (!cur.note && r.note) cur.note = r.note as string;
    extById.set(r.user_id as string, cur);
  }
  const creditById = new Map<string, number>();
  for (const c of credits ?? []) creditById.set(c.user_id as string, (creditById.get(c.user_id as string) || 0) + ((c.amount_cents as number) || 0));
  const entryPaidById = new Map<string, number>();
  for (const p of entryPays ?? []) entryPaidById.set(p.user_id as string, (entryPaidById.get(p.user_id as string) || 0) + ((p.amount_cents as number) || 0));
  const entryPaidFor = (uid: string) => entryCents <= 0 || (entryPaidById.get(uid) || 0) >= entryCents;

  const profById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return {
    ready,
    potCents,
    people: winnerIds
      .map((uid) => {
        const p = profById.get(uid);
        const ext = extById.get(uid);
        const credit = creditById.get(uid) || 0;
        return {
          userId: uid,
          name: p ? pickName(p, nameMode) : "Member",
          place: placeByUser.get(uid) || 0,
          correct: correctByUser.get(uid) || 0,
          wonCents: wonByUser.get(uid) || 0,
          paidCents: (ext?.cents ?? 0) + credit,
          method: ext?.method ?? (credit > 0 ? "Account" : null),
          note: ext?.note ?? null,
          appliedToAccount: credit > 0,
          venmo: (p?.venmo_username as string | null) ?? null,
          paypal: (p?.paypal_username as string | null) ?? null,
          address: (p?.mailing_address as string | null) ?? null,
          entryPaid: entryPaidFor(uid),
        };
      })
      .sort((a, b) => a.place - b.place || b.wonCents - a.wonCents),
  };
}
