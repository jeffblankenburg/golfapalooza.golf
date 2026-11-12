import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { slateLockAt, gameLocked, lockModeOf, gameIsScored, provisionalWinnings, type PickemPick } from "@/lib/v2/contests/pickem";
import { MATCHUP_SELECT, matchupToPickemGame, type MatchupRow } from "@/lib/v2/contests/pickem-server";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";
import HomeCardsLive from "./HomeCardsLive";
import styles from "./SquaresHomeCards.module.css";

/** Small "this is a Pick'em" marker (box + check glyph + label), matching the
 *  type badge used on the admin list. */
function PickemTag() {
  return (
    <span className={styles.typeTag}>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" stroke="currentColor" strokeWidth={2} />
        <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Pick&apos;em
    </span>
  );
}

/**
 * Home-page Pick'em cards — one per open pool (group-scoped or on the active
 * event), showing the member's pick progress and a status badge. Mirrors the
 * Squares home card. Links to the shared contest detail where picks are made.
 */
export default async function PickemHomeCards({ orgId, userId, slug, eventId }: { orgId: string; userId: string; slug: string; eventId: string | null }) {
  const supabase = await v2ServerClient();
  // With an active event: group-scoped pools (event_id NULL) plus this event's own.
  // With no active event: only the group-scoped pools exist to show.
  let query = supabase
    .from("v2_contests")
    .select("id, name, event_id, config, payout_splits")
    .eq("org_id", orgId)
    .eq("contest_type", "pickem")
    .eq("status", "active");
  query = eventId ? query.or(`event_id.is.null,event_id.eq.${eventId}`) : query.is("event_id", null);
  const { data: contests } = await query;
  if (!contests || contests.length === 0) return null;

  const money = (cents: number) => {
    const whole = cents % 100 === 0;
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
  };

  const ids = contests.map((c) => c.id);
  // Full matchup rows (not just times): ranking the "if it ends now" winnings needs
  // scores/lines. All picks + participant counts come alongside so provisional standings
  // use the same inputs the contest board does.
  const [{ data: gameRows }, { data: parts }] = await Promise.all([
    supabase.from("v2_matchups").select(MATCHUP_SELECT).in("contest_id", ids),
    supabase.from("v2_contest_participants").select("contest_id").in("contest_id", ids),
  ]);
  const games = ((gameRows ?? []) as unknown as MatchupRow[]).map((r) => ({ game: matchupToPickemGame(r), contestId: r.contest_id }));
  const gameIds = games.map((g) => g.game.id);
  const { data: pickRows } = gameIds.length
    ? await supabase.from("v2_picks").select("matchup_id, contest_id, user_id, pick, tiebreaker").in("matchup_id", gameIds)
    : { data: [] as { matchup_id: string; contest_id: string; user_id: string; pick: { side?: string } | null; tiebreaker: number | null }[] };
  const now = await v2Now();

  const entrantsByContest = new Map<string, number>();
  for (const p of parts ?? []) entrantsByContest.set(p.contest_id as string, (entrantsByContest.get(p.contest_id as string) ?? 0) + 1);

  const cards = contests
    .map((c) => {
      const cGames = games.filter((g) => g.contestId === c.id).map((g) => g.game);
      const total = cGames.length;
      if (total === 0) return null; // nothing to pick yet
      const cGameIds = new Set(cGames.map((g) => g.id));
      const cPicks: PickemPick[] = (pickRows ?? [])
        .filter((p) => cGameIds.has(p.matchup_id as string))
        .map((p) => ({
          game_id: p.matchup_id as string, user_id: p.user_id as string,
          picked_team: (p.pick as { side?: string } | null)?.side === "a" ? "away" : (p.pick as { side?: string } | null)?.side === "b" ? "home" : null,
          tiebreaker_total: (p.tiebreaker as number | null) ?? null,
        }));
      const myPicked = new Set(cPicks.filter((p) => p.user_id === userId && p.picked_team).map((p) => p.game_id));
      const picked = cGames.filter((g) => myPicked.has(g.id)).length;
      const lockMode = lockModeOf(c.config as Record<string, unknown> | null);
      const slateLock = slateLockAt(cGames);
      const locked = cGames.every((g) => gameLocked(g, lockMode, slateLock, now));
      // "Make picks" → "Picked" → "Locked" (picking closed) → "Final" (every game scored,
      // standings + payouts settled). Final takes precedence: once the last game is in, the
      // card reads Final, not the stale Locked.
      const anyScored = cGames.some(gameIsScored);
      const allScored = total > 0 && cGames.every(gameIsScored);
      const badge = allScored ? "Final" : locked ? "Locked" : picked >= total ? "Picked" : "Make picks";

      const entry = Number((c.config as { entry_cents?: number } | null)?.entry_cents) || 0;
      const potCents = entry * (entrantsByContest.get(c.id) ?? 0);
      // Moneybag: once a result has landed and the viewer is in a paying place. The amount is
      // projected ("if it ends now") until every game is final, then it's the settled payout.
      const myWinnings = anyScored
        ? provisionalWinnings(cGames, cPicks, potCents, (c.payout_splits as PayoutSplit[] | null) ?? null).get(userId) ?? 0
        : 0;
      return (
        <Link key={c.id} href={`/new/${slug}/contests/${c.id}`} className={styles.draftCard}>
          <div className={styles.draftTop}>
            <span className={styles.name}>{c.name || "Pick'em"}</span>
            <span className={styles.badge}>{badge}</span>
          </div>
          <PickemTag />
          <div className={styles.draftStats}>
            <span><strong>{picked}/{total}</strong> picked</span>
            {potCents > 0 && <span><strong>{money(potCents)}</strong> pot</span>}
            {myWinnings > 0 && (
              <span className={styles.moneyTag} title={allScored ? "In the money" : "In the money if it ends now"}>
                <span aria-hidden>💰</span> <strong>{money(myWinnings)}</strong>
              </span>
            )}
          </div>
        </Link>
      );
    })
    .filter(Boolean);

  // Keep the cards live even when none currently render (e.g. a game gets posted → the card
  // should appear) — mount the refresher whenever there's an active pool to subscribe to.
  const live = <HomeCardsLive contests={ids.map((id) => ({ type: "pickem" as const, contestId: id }))} />;
  return <>{cards}{live}</>;
}
