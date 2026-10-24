import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { slateLockAt, gameLocked, lockModeOf, type PickemGame } from "@/lib/v2/contests/pickem";
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
export default async function PickemHomeCards({ orgId, userId, slug, eventId }: { orgId: string; userId: string; slug: string; eventId: string }) {
  const supabase = await v2ServerClient();
  const { data: contests } = await supabase
    .from("v2_contests")
    .select("id, name, event_id, config")
    .eq("org_id", orgId)
    .eq("contest_type", "pickem")
    .eq("status", "active")
    .or(`event_id.is.null,event_id.eq.${eventId}`);
  if (!contests || contests.length === 0) return null;

  const money = (cents: number) => {
    const whole = cents % 100 === 0;
    return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
  };

  const ids = contests.map((c) => c.id);
  const { data: gameRows } = await supabase
    .from("v2_matchups").select("id, contest_id, start_time").in("contest_id", ids);
  const games = (gameRows ?? []).map((g) => ({ id: g.id as string, contest_id: g.contest_id as string, game_time: g.start_time as string | null }));
  const gameIds = games.map((g) => g.id);
  const { data: pickRows } = gameIds.length
    ? await supabase.from("v2_picks").select("matchup_id, pick").eq("user_id", userId).in("matchup_id", gameIds)
    : { data: [] as { matchup_id: string; pick: { side?: string } | null }[] };
  const myPicked = new Set((pickRows ?? []).filter((p) => (p.pick as { side?: string } | null)?.side).map((p) => p.matchup_id as string));
  const now = await v2Now();

  const cards = contests
    .map((c) => {
      const cGames = games.filter((g) => g.contest_id === c.id);
      const total = cGames.length;
      if (total === 0) return null; // nothing to pick yet
      const picked = cGames.filter((g) => myPicked.has(g.id)).length;
      const lockMode = lockModeOf(c.config as Record<string, unknown> | null);
      const slateLock = slateLockAt(cGames as unknown as PickemGame[]);
      const locked = cGames.length > 0 && cGames.every((g) => gameLocked(g as unknown as PickemGame, lockMode, slateLock, now));
      const badge = locked ? "Locked" : picked >= total ? "Picked" : "Make picks";
      const entry = Number((c.config as { entry_cents?: number } | null)?.entry_cents) || 0;
      return (
        <Link key={c.id} href={`/new/${slug}/contests/${c.id}`} className={styles.draftCard}>
          <div className={styles.draftTop}>
            <span className={styles.name}>{c.name || "Pick'em"}</span>
            <span className={styles.badge}>{badge}</span>
          </div>
          <PickemTag />
          <div className={styles.draftStats}>
            <span><strong>{picked}/{total}</strong> picked</span>
            {entry > 0 && <span><strong>{money(entry)}</strong> entry</span>}
          </div>
        </Link>
      );
    })
    .filter(Boolean);

  if (cards.length === 0) return null;
  return <>{cards}</>;
}
