"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  THREES_EVENT_BY_KEY,
  currentStreak,
  brokeStreak,
  kachingCount,
  favoredSide,
  type ThreesReaction,
  type ThreesEventRow,
} from "@/lib/v2/contests/threes";
import type { ThreesState } from "@/lib/v2/contests/threes-server";
import type { GameScore } from "@/lib/v2/sports/espn";
import { subscribeToThrees } from "@/lib/v2/realtime/threes-channel";
import { playSound, preloadSounds, unlockAudio } from "@/lib/v2/soundboard-audio";
import styles from "./threes.module.css";
/* eslint-disable @next/next/no-img-element */

const KACHING = "/kaching-sound-fx.mp3";
const SWIPE_IN = 500; // ms: stripe swipe-in (sounds + streak land at the end of it)
const GAP = 550; // ms between cash-register rings
const SWIPE_OUT = 420; // ms: stripe swipe-out
const HOLD_AFTER_SOUNDS = 1000; // ms: linger fully extended after the last ring, for reading

/** Scale the bills so N of them always fit across the team's half, and stay
 *  small on phones (vmin cap) so they don't swamp the layout. */
function billFont(n: number): string {
  return `clamp(1rem, ${(40 / n).toFixed(2)}vw, min(10rem, 16vmin))`;
}
interface Reaction {
  key: number;
  side: "a" | "b";
  color: string;
  gif: string | null;
  label: string;
  value: string | null; // "+2" / "−2" for events worth more than 1
  broke: string | null; // "KC's 3 run ended" — an ADDITIONAL callout, not a replacement
  phase: "in" | "out";
}

export default function ThreesBoard({ state, score, exitHref }: { state: ThreesState; score: GameScore | null; exitHref?: string }) {
  const router = useRouter();
  const { game, events, reactions, streakCap } = state;
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [bills, setBills] = useState<{ side: "a" | "b"; count: number } | null>(null); // $ owed; persists until the next play
  const [fading, setFading] = useState<{
    key: number;
    bills: { side: "a" | "b"; count: number } | null;
    streak: { side: "a" | "b"; value: number; count: number } | null;
  } | null>(null); // the previous bills / broken streak, fading out over the bar's slide-out
  const [landed, setLanded] = useState(0); // bumps when a stripe lands → streak pops
  const lastIdRef = useRef<string | null>(events.length ? events[events.length - 1].id : null);
  const billsRef = useRef<{ side: "a" | "b"; count: number } | null>(null);
  const tickerRef = useRef<HTMLDivElement>(null);
  const reactionKey = useRef(0);
  useEffect(() => {
    billsRef.current = bills;
  }, [bills]);

  useEffect(() => {
    preloadSounds([KACHING]);
    const onGesture = () => unlockAudio();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("touchend", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    const unsub = subscribeToThrees(state.contest.id, () => router.refresh());
    const iv = setInterval(() => router.refresh(), 4000);
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchend", onGesture);
      window.removeEventListener("keydown", onGesture);
      unsub();
      clearInterval(iv);
    };
  }, [state.contest.id, router]);

  // On a new event: swipe a team-color stripe in from that team's edge. When it
  // lands, the streak pops and the cash register starts. When the rings finish,
  // the stripe slides back out.
  useEffect(() => {
    if (!game) return;
    const newest = events.length ? events[events.length - 1] : null;
    if (!newest) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ref-guarded, fires once on reset
      if (lastIdRef.current !== null) setBills(null);
      lastIdRef.current = null;
      return;
    }
    if (newest.id === lastIdRef.current) return;
    lastIdRef.current = newest.id;

    const rows = events as ThreesEventRow[];
    const broke = brokeStreak(rows);
    const def = THREES_EVENT_BY_KEY[newest.event_type];
    const run = currentStreak(rows, streakCap);
    const kachings = kachingCount(run.count, def?.points ?? 1, streakCap);

    // Always show the actual play; a broken streak is an ADDITIONAL callout.
    const r = reactions[newest.event_type] as ThreesReaction | undefined;
    const label = def?.label || "";
    const value = def && def.points > 1 ? `${def.result === "win" ? "+" : "−"}${def.points}` : null;
    const brokenTeam = broke.broke && broke.side ? (broke.side === "a" ? game.teamA : game.teamB) : null;
    const brokeText = brokenTeam ? `${brokenTeam.abbrev || brokenTeam.shortName}'s ${broke.count} run ended` : null;

    const team = newest.team === "a" ? game.teamA : game.teamB;
    const color = team.color || (newest.team === "a" ? "#1d4ed8" : "#b91c1c");
    const gif = r?.gifs && r.gifs.length ? r.gifs[Math.floor(Math.random() * r.gifs.length)] : null;

    const myKey = ++reactionKey.current;

    // Fade the previous play's bills (and a broken streak) to nothing over the
    // bar's slide-out time, instead of snapping them away.
    const oldBills = billsRef.current;
    const prevStreak = currentStreak(rows.slice(0, -1), streakCap);
    const oldStreak =
      prevStreak.side && prevStreak.side !== run.side && prevStreak.value > 0
        ? { side: prevStreak.side, value: prevStreak.value, count: prevStreak.count }
        : null;
    if (oldBills || oldStreak) {
      setFading({ key: myKey, bills: oldBills, streak: oldStreak });
      setBills(null); // the fading copy takes over the old bills
      setTimeout(() => setFading((f) => (f && f.key === myKey ? null : f)), SWIPE_OUT);
    }

    setReaction({ key: myKey, side: newest.team, color, gif, label, value, broke: brokeText, phase: "in" });
    // Snap the ticker back to the newest play (newest is on the left).
    if (tickerRef.current) tickerRef.current.scrollLeft = 0;
    // Dollars go to the side that COLLECTS (the favored side) — the executing
    // team on a win, the opponent on an owe (airball / missed dunk).
    const billSide = favoredSide(newest);
    setTimeout(() => setBills({ side: billSide, count: kachings }), SWIPE_IN);

    for (let i = 0; i < kachings; i++) setTimeout(() => void playSound(KACHING), SWIPE_IN + i * GAP);
    const soundUrl = r?.soundUrl;
    if (soundUrl) setTimeout(() => void playSound(soundUrl), SWIPE_IN);
    // Additional cue when a streak breaks.
    const breakSound = brokenTeam ? (reactions.streak_break as ThreesReaction | undefined)?.soundUrl ?? null : null;
    if (breakSound) setTimeout(() => void playSound(breakSound), SWIPE_IN);
    setTimeout(() => setLanded((l) => l + 1), SWIPE_IN);

    const recedeAt = SWIPE_IN + kachings * GAP + HOLD_AFTER_SOUNDS;
    setTimeout(() => setReaction((cur) => (cur && cur.key === myKey ? { ...cur, phase: "out" } : cur)), recedeAt);
    setTimeout(() => setReaction((cur) => (cur && cur.key === myKey ? null : cur)), recedeAt + SWIPE_OUT);
  }, [events, game, reactions, streakCap]);

  if (!game) {
    return (
      <div className={styles.board}>
        <div className={styles.boardWaiting}>Waiting for a game…</div>
      </div>
    );
  }

  const streak = currentStreak(events as ThreesEventRow[], streakCap);
  const recentPlays = events.slice(-40).reverse(); // newest on the left; fills across, older clips off the right
  const liveOn = !!score && score.state !== "pre";
  const liveA = liveOn ? score!.away?.current ?? null : null;
  const liveB = liveOn ? score!.home?.current ?? null : null;
  const statusText = liveOn ? score!.detail || null : null;

  return (
    <div
      className={styles.board}
      style={{ ["--team-a" as string]: game.teamA.color || "#1d4ed8", ["--team-b" as string]: game.teamB.color || "#b91c1c" } as React.CSSProperties}
    >
      {exitHref && (
        <Link href={exitHref} className={styles.boardExit} aria-label="Close board">×</Link>
      )}
      <div className={styles.sides}>
        {liveOn && (
          <div className={styles.scoreboard}>
            <span className={styles.sbScore} data-team="a">{liveA ?? "–"}</span>
            {statusText && <span className={styles.sbClock}>{statusText}</span>}
            <span className={styles.sbScore} data-team="b">{liveB ?? "–"}</span>
          </div>
        )}
        <TeamHalf team={game.teamA} side="a" hot={streak.side === "a"} value={streak.value} count={streak.count} bump={landed} />
        <TeamHalf team={game.teamB} side="b" hot={streak.side === "b"} value={streak.value} count={streak.count} bump={landed} />

      {bills && bills.count > 0 && (
        <div className={styles.dollars} data-side={bills.side} style={{ fontSize: billFont(bills.count) }}>
          {Array.from({ length: bills.count }).map((_, i) => (
            <span key={i} className={styles.dollar}>💸</span>
          ))}
        </div>
      )}
      {fading?.bills && fading.bills.count > 0 && (
        <div className={`${styles.dollars} ${styles.fadeAway}`} data-side={fading.bills.side} style={{ fontSize: billFont(fading.bills.count) }}>
          {Array.from({ length: fading.bills.count }).map((_, i) => (
            <span key={i} className={styles.dollar}>💸</span>
          ))}
        </div>
      )}
      {fading?.streak && (
        <div className={`${styles.fadeStreak} ${styles.fadeAway}`} data-side={fading.streak.side}>
          <div className={styles.halfStreakMain}>🔥 +{fading.streak.value}</div>
          <div className={styles.halfStreakSub} style={fading.streak.count < 2 ? { visibility: "hidden" } : undefined}>
            {fading.streak.count >= 2 ? `${fading.streak.count} in a row` : "in a row"}
          </div>
        </div>
      )}
      {reaction && (
        <div
          className={styles.stripe}
          data-side={reaction.side}
          data-phase={reaction.phase}
          style={{ ["--stripe-color" as string]: reaction.color } as React.CSSProperties}
        >
          <div className={styles.stripeContent}>
            {reaction.gif && <img src={reaction.gif} alt="" className={styles.stripeGif} />}
            <div className={styles.stripeText}>
              {reaction.broke && <div className={styles.stripeBroke}>💥 Streak broken</div>}
              <div className={styles.stripeLabel}>
                {reaction.label}
                {reaction.value && <span className={styles.stripeValue}>{reaction.value}</span>}
              </div>
              {reaction.broke && <div className={styles.stripeSub}>{reaction.broke}</div>}
            </div>
          </div>
        </div>
      )}
      </div>

      {recentPlays.length > 0 && (
        <div className={styles.ticker} ref={tickerRef}>
          {recentPlays.map((e) => {
            const def = THREES_EVENT_BY_KEY[e.event_type];
            const tm = e.team === "a" ? game.teamA : game.teamB;
            return (
              <span key={e.id} className={styles.tickerItem}>
                <span className={styles.tickerDot} style={{ background: tm.color || "#888" }} />
                <b>{tm.abbrev || tm.shortName}</b> {def?.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeamHalf({
  team,
  side,
  hot,
  value,
  count,
  bump,
}: {
  team: { name: string; shortName: string; abbrev: string | null; logo: string | null; color: string | null };
  side: "a" | "b";
  hot: boolean;
  value: number;
  count: number;
  bump: number;
}) {
  return (
    <div className={styles.half} data-side={side} data-hot={hot || undefined}>
      <div className={styles.halfTop}>
        {team.logo && <img src={team.logo} alt="" className={styles.halfLogo} />}
        <div className={styles.halfName}>{team.name}</div>
      </div>
      {hot && value > 0 && (
        <div key={bump} className={styles.halfStreak}>
          <div className={styles.halfStreakMain}>🔥 +{value}</div>
          {/* Always rendered (blank below 2) so the +N never shifts. */}
          <div className={styles.halfStreakSub} style={count < 2 ? { visibility: "hidden" } : undefined}>
            {count >= 2 ? `${count} in a row` : "in a row"}
          </div>
        </div>
      )}
    </div>
  );
}
