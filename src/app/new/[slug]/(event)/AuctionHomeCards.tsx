import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { loadAuction } from "@/lib/v2/contests/auction-server";
import HomeCardsLive from "./HomeCardsLive";
import styles from "./SquaresHomeCards.module.css";

/** Small "this is an Auction" marker (gavel glyph + label), matching the admin type badge. */
function AuctionTag() {
  return (
    <span className={styles.typeTag}>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h9" />
        <path d="M7 11l6 6" />
        <path d="M10.5 7.5l6 6" />
        <path d="M13 5l6 6" />
        <path d="M8.5 9l4-4" />
      </svg>
      Auction
    </span>
  );
}

const money = (cents: number) => {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
};
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * Home-page Auction cards — one per set-up pool (group-scoped or on the active event).
 * The card follows the auction's phase: the lobby shows the headcount + entry, a live auction
 * shows the viewer's lots + remaining balance, and a finished auction becomes a mini scoreboard
 * (point total, standings place, teams). Links to the shared contest detail (the member board).
 */
export default async function AuctionHomeCards({ orgId, userId, slug, eventId }: { orgId: string; userId: string; slug: string; eventId: string | null }) {
  const supabase = await v2ServerClient();
  // With an active event: group-scoped auctions (event_id NULL) plus this event's own.
  // With no active event: only the group-scoped auctions exist to show.
  let query = supabase
    .from("v2_contests")
    .select("id, name, event_id")
    .eq("org_id", orgId)
    .eq("contest_type", "auction")
    .eq("status", "active");
  query = eventId ? query.or(`event_id.is.null,event_id.eq.${eventId}`) : query.is("event_id", null);
  const { data: contests } = await query;
  const live = contests ?? [];
  if (live.length === 0) return null;

  // Full state per auction — gives the viewer's points/place/lots without a second query shape.
  const states = await Promise.all(live.map((c) => loadAuction(supabase, c.id)));

  const cards = live.map((c, idx) => {
    const state = states[idx];
    if (!state) return null;
    const { config, participants } = state;
    const complete = config.complete;
    const isLive = config.live;
    const badge = complete ? "Final" : isLive ? "Live" : "View";

    const standings = [...participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents);
    const me = participants.find((p) => p.userId === userId) ?? null;
    const myPlace = me ? standings.indexOf(me) + 1 : null;
    const myLots = me ? me.teams.length : 0;
    const n = participants.length;
    const entry = state.buyInCents;

    return (
      <Link key={c.id} href={`/new/${slug}/contests/${c.id}`} className={styles.draftCard}>
        <div className={styles.draftTop}>
          <span className={styles.name}>{c.name || "Auction"}</span>
          <span className={styles.badge}>{badge}</span>
        </div>
        <AuctionTag />
        <div className={styles.draftStats}>
          {complete ? (
            <>
              <span><strong>{me ? me.points : 0}</strong> pts</span>
              {myPlace && <span><strong>{ordinal(myPlace)}</strong> of {n}</span>}
              <span><strong>{myLots}</strong> {myLots === 1 ? "team" : "teams"}</span>
            </>
          ) : isLive ? (
            <>
              <span><strong>{myLots}</strong> {myLots === 1 ? "lot" : "lots"}</span>
              {me && <span><strong>{money(me.remainingCents)}</strong> left</span>}
            </>
          ) : (
            <>
              <span><strong>{n}</strong> {n === 1 ? "player" : "players"}</span>
              {entry > 0 && <span><strong>{money(entry)}</strong> entry</span>}
            </>
          )}
        </div>
      </Link>
    );
  });

  const liveRefresher = (
    <HomeCardsLive
      contests={states.map((s, idx) => ({
        type: "auction" as const,
        contestId: live[idx].id,
        tournamentId: s?.config.tournamentId ?? null,
      }))}
    />
  );
  return <>{cards}{liveRefresher}</>;
}
