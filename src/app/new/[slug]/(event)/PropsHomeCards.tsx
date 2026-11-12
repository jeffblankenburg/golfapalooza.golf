import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { loadPropsBoard } from "@/lib/v2/contests/props-server";
import HomeCardsLive from "./HomeCardsLive";
import styles from "./SquaresHomeCards.module.css";

/** Small "this is a Props" marker (clipboard + question glyph), matching the admin type badge. */
function PropsTag() {
  return (
    <span className={styles.typeTag}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M9.2 9a2.5 2.5 0 1 1 3.3 2.4c-.8.3-1.2.9-1.2 1.7" />
        <path d="M11.3 16.3h.01" />
      </svg>
      Props
    </span>
  );
}

const money = (cents: number) => {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
};
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * Home-page Props cards — one per open pool (group-scoped or on the active event). Pre-lock
 * shows answer progress; once settled it becomes a mini scoreboard (points, place), with a
 * moneybag when the viewer is in a paying place. Links to the shared contest detail.
 */
export default async function PropsHomeCards({ orgId, userId, slug, eventId }: { orgId: string; userId: string; slug: string; eventId: string | null }) {
  const supabase = await v2ServerClient();
  let query = supabase
    .from("v2_contests")
    .select("id, name, event_id")
    .eq("org_id", orgId)
    .eq("contest_type", "props")
    .eq("status", "active");
  query = eventId ? query.or(`event_id.is.null,event_id.eq.${eventId}`) : query.is("event_id", null);
  const { data: contests } = await query;
  if (!contests || contests.length === 0) return null;

  const now = await v2Now();
  const boards = await Promise.all(contests.map((c) => loadPropsBoard(supabase, { contestId: c.id, orgId, viewerId: userId, now })));

  const cards = contests.map((c, idx) => {
    const b = boards[idx];
    if (b.totalQuestions === 0) return null; // nothing to answer yet

    const answered = Object.values(b.myAnswers).filter((a) => a.choice != null || a.number != null).length;
    const badge = b.settled ? "Final" : b.locked ? "Locked" : answered >= b.totalQuestions ? "Answered" : "Answer";
    const me = b.leaderboard.find((e) => e.userId === userId) ?? null;
    const myPlace = me ? b.leaderboard.indexOf(me) + 1 : null;
    const myWinnings = me?.provisionalCents ?? 0;
    const showScore = b.locked && me; // points/place meaningful once locked

    return (
      <Link key={c.id} href={`/new/${slug}/contests/${c.id}`} className={styles.draftCard}>
        <div className={styles.draftTop}>
          <span className={styles.name}>{c.name || "Props"}</span>
          <span className={styles.badge}>{badge}</span>
        </div>
        <PropsTag />
        <div className={styles.draftStats}>
          {showScore ? (
            <>
              <span><strong>{me!.points}</strong> pts</span>
              {myPlace && <span><strong>{ordinal(myPlace)}</strong> of {b.leaderboard.length}</span>}
            </>
          ) : (
            <span><strong>{answered}/{b.totalQuestions}</strong> answered</span>
          )}
          {b.potCents > 0 && <span><strong>{money(b.potCents)}</strong> pot</span>}
          {myWinnings > 0 && (
            <span className={styles.moneyTag} title={b.settled ? "In the money" : "In the money if it ends now"}>
              <span aria-hidden>💰</span> <strong>{money(myWinnings)}</strong>
            </span>
          )}
        </div>
      </Link>
    );
  }).filter(Boolean);

  const live = <HomeCardsLive contests={contests.map((c) => ({ type: "props" as const, contestId: c.id }))} />;
  return <>{cards}{live}</>;
}
