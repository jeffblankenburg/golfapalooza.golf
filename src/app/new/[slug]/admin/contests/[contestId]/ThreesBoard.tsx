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
import type { GameScore, GameSituation } from "@/lib/v2/sports/espn";
import { subscribeToThrees } from "@/lib/v2/realtime/threes-channel";
import { playSound, preloadSounds, cachedSoundDurationMs, unlockAudio } from "@/lib/v2/soundboard-audio";
import styles from "./threes.module.css";
/* eslint-disable @next/next/no-img-element */

const KACHING = "/kaching-sound-fx.mp3";
const SWIPE_IN = 500; // ms: stripe swipe-in (sounds + streak land at the end of it)
const GAP = 550; // ms between cash-register rings
const SWIPE_OUT = 420; // ms: stripe swipe-out
const HOLD_AFTER_SOUNDS = 1000; // ms: linger fully extended after the last ring, for reading
const AND_ONE_EXIT = SWIPE_OUT; // an And-1 bar fully slides out before a resolving play's swipe
const DEFAULT_SOUND_LEAD = 900; // ms: fallback gap before the register when a clip's length isn't cached yet

/** Scale the bills so N of them always fit across the team's half, and stay
 *  small on phones (vmin cap) so they don't swamp the layout. */
function billFont(n: number): string {
  return `clamp(1rem, ${(40 / n).toFixed(2)}vw, min(10rem, 16vmin))`;
}

/** Deterministic index from a seed (an event id), so every board view picks the
 *  SAME GIF for a given play instead of each client rolling its own random. */
function seededIndex(seed: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % n;
}

/** Pick a GIF for a play deterministically (same across all boards). */
function pickGif(gifs: string[] | undefined, seed: string): string | null {
  return gifs && gifs.length ? gifs[seededIndex(seed, gifs.length)] : null;
}
interface Reaction {
  key: number;
  side: "a" | "b";
  color: string;
  label: string;
  value: string | null; // "+2" / "−2" for events worth more than 1
  broke: string | null; // "KC's 3 run ended" — an ADDITIONAL callout, not a replacement
  phase: "in" | "out";
}

/** A GIF blanketing the losing team's half. Its own lifetime (≥ one full loop). */
interface Cover {
  key: number;
  side: "a" | "b";
  gif: string;
  phase: "in" | "out";
}

/** The persistent And-1 treatment: a held-open bar on the beneficiary's half +
 *  a GIF covering the other half, both staying until resolved or dismissed. */
interface AndOneView {
  key: number;
  side: "a" | "b"; // the team that made the basket (gets the bar)
  color: string;
  potential: 3 | 4;
  gif: string | null;
  phase: "in" | "out";
}

const MIN_COVER = 1800; // ms: shortest a GIF cover ever shows (so quick loops still read)
const DEFAULT_COVER = 2600; // ms: hold when we can't measure the loop length
const COVER_FADE = 420; // ms: matches the gifCoverOut animation

/**
 * One full loop of an animated image, in ms, via the WebCodecs ImageDecoder
 * (Chromium: the usual big-board browser). Returns null when unavailable (e.g.
 * iOS Safari) or for a single-frame image, so the caller uses a default hold.
 */
async function gifLoopMs(url: string): Promise<number | null> {
  try {
    const ID = (globalThis as unknown as { ImageDecoder?: new (init: { data: ArrayBuffer; type: string }) => {
      tracks: { ready: Promise<void>; selectedTrack?: { frameCount?: number; animated?: boolean } };
      decode: (o: { frameIndex: number }) => Promise<{ image: { duration?: number; close?: () => void } }>;
      close?: () => void;
    } }).ImageDecoder;
    if (!ID) return null;
    const res = await fetch(url);
    const data = await res.arrayBuffer();
    const dec = new ID({ data, type: res.headers.get("content-type") || "image/gif" });
    await dec.tracks.ready;
    const track = dec.tracks.selectedTrack;
    const frames = track?.frameCount ?? 1;
    if (track?.animated === false || frames <= 1) return null;
    let total = 0;
    for (let i = 0; i < frames; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      total += (image.duration ?? 0) / 1000; // microseconds → ms
      image.close?.();
    }
    dec.close?.();
    return total > 0 ? total : null;
  } catch {
    return null;
  }
}

export default function ThreesBoard({ state, score, situation, exitHref }: { state: ThreesState; score: GameScore | null; situation?: GameSituation | null; exitHref?: string }) {
  const router = useRouter();
  const { game, events, reactions, streakCap, andOne } = state;
  const [audioReady, setAudioReady] = useState(false);
  const [andOneView, setAndOneView] = useState<AndOneView | null>(null);
  const andOneRef = useRef<string | null>(null); // prev pending team (raise sound once + resolve sequencing)
  const andOneViewKey = useRef(0);
  const [reaction, setReaction] = useState<Reaction | null>(null);
  const [cover, setCover] = useState<Cover | null>(null);
  const coverKey = useRef(0);
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

  // Warm the cash register + every configured reaction sound so they play
  // instantly and their durations are known for sequencing the register after.
  useEffect(() => {
    const reactionSounds = Object.values(reactions)
      .map((r) => (r as ThreesReaction | undefined)?.soundUrl)
      .filter((u): u is string => !!u);
    preloadSounds([KACHING, ...reactionSounds]);
  }, [reactions]);

  useEffect(() => {
    // Keep priming audio on EVERY interaction (not just the first) — a projected
    // board can sit idle and the context may re-suspend; any tap re-unlocks it.
    const onGesture = () => {
      unlockAudio();
      setAudioReady(true); // in a gesture handler, not the effect body
    };
    const events = ["pointerdown", "touchend", "keydown", "click"] as const;
    for (const e of events) window.addEventListener(e, onGesture);
    const unsub = subscribeToThrees(state.contest.id, () => router.refresh());
    const iv = setInterval(() => router.refresh(), 4000);
    return () => {
      for (const e of events) window.removeEventListener(e, onGesture);
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
    // The chip is the PAYOUT to the collecting team — always positive (the bar
    // already sits on the team that collects, even on an owe like a missed dunk).
    const value = def && def.points > 1 ? `+${def.points}` : null;
    const brokenTeam = broke.broke && broke.side ? (broke.side === "a" ? game.teamA : game.teamB) : null;
    const brokeText = brokenTeam ? `${brokenTeam.abbrev || brokenTeam.shortName}'s ${broke.count} run ended` : null;

    // The server picked this play's GIF (shuffle bag). Fall back to a deterministic
    // pick for any event logged before gif_url existed, so it's still board-consistent.
    const gif = newest.gif_url ?? pickGif(r?.gifs, newest.id);

    const myKey = ++reactionKey.current;

    const oldBills = billsRef.current;
    const prevStreak = currentStreak(rows.slice(0, -1), streakCap);
    const oldStreak =
      prevStreak.side && prevStreak.side !== run.side && prevStreak.value > 0
        ? { side: prevStreak.side, value: prevStreak.value, count: prevStreak.count }
        : null;

    // The bar + dollars go to the team GETTING THE BENEFIT (the favored side) — the
    // executing team on a win, the opponent on an owe (airball / missed dunk). The
    // GIF covers the OTHER half (the team that lost the exchange).
    const billSide = favoredSide(newest);
    const gifSide: "a" | "b" = billSide === "a" ? "b" : "a";
    const favTeam = billSide === "a" ? game.teamA : game.teamB;
    const color = favTeam.color || (billSide === "a" ? "#1d4ed8" : "#b91c1c");
    const soundUrl = r?.soundUrl;
    const breakSound = brokenTeam ? (reactions.streak_break as ThreesReaction | undefined)?.soundUrl ?? null : null;

    // If this play resolves a pending And-1, the And-1 must FULLY animate out
    // before any of this slides in. Always. (This effect runs before the And-1
    // effect, so andOneRef still holds the pre-resolve pending team.)
    const delay = andOneRef.current ? AND_ONE_EXIT : 0;

    const begin = () => {
      // Fade the previous play's bills (and a broken streak) over the slide-out.
      if (oldBills || oldStreak) {
        setFading({ key: myKey, bills: oldBills, streak: oldStreak });
        setBills(null);
        setTimeout(() => setFading((f) => (f && f.key === myKey ? null : f)), SWIPE_OUT);
      }

      setReaction({ key: myKey, side: billSide, color, label, value, broke: brokeText, phase: "in" });
      if (tickerRef.current) tickerRef.current.scrollLeft = 0;

      // When the bar lands: the streak pops and the assigned reaction sound plays.
      setTimeout(() => setLanded((l) => l + 1), SWIPE_IN);
      if (soundUrl) setTimeout(() => void playSound(soundUrl), SWIPE_IN);
      if (breakSound) setTimeout(() => void playSound(breakSound), SWIPE_IN);

      // The cash register FOLLOWS the reaction sound: start it one clip-length after
      // SWIPE_IN so the clip is heard first. The length is read synchronously from
      // the preloaded cache (default on a miss), so the rings are ALWAYS scheduled.
      const lead = soundUrl ? cachedSoundDurationMs(soundUrl) ?? DEFAULT_SOUND_LEAD : 0;
      const start = SWIPE_IN + lead;
      setTimeout(() => setBills({ side: billSide, count: kachings }), start);
      for (let i = 0; i < kachings; i++) setTimeout(() => void playSound(KACHING), start + i * GAP);
      const recedeAt = start + kachings * GAP + HOLD_AFTER_SOUNDS;
      setTimeout(() => setReaction((cur) => (cur && cur.key === myKey ? { ...cur, phase: "out" } : cur)), recedeAt);
      setTimeout(() => setReaction((cur) => (cur && cur.key === myKey ? null : cur)), recedeAt + SWIPE_OUT);

      // The GIF cover runs on its OWN clock: stay up for at least one full loop
      // (measured when we can) so the whole GIF plays before it dismisses.
      if (gif) {
        const ck = ++coverKey.current;
        setCover({ key: ck, side: gifSide, gif, phase: "in" });
        void gifLoopMs(gif).then((loop) => {
          const hold = Math.max(MIN_COVER, loop ?? DEFAULT_COVER);
          setTimeout(() => setCover((c) => (c && c.key === ck ? { ...c, phase: "out" } : c)), hold);
          setTimeout(() => setCover((c) => (c && c.key === ck ? null : c)), hold + COVER_FADE);
        });
      }
    };

    if (delay) setTimeout(begin, delay);
    else begin();
  }, [events, game, reactions, streakCap]);

  // And 1: a held-open bar on the beneficiary's half + a GIF covering the other
  // half, staying until the scorer resolves or dismisses it. On raise it rings the
  // sound once; on clear the bar slides out (and a resolving play waits it out).
  useEffect(() => {
    const team = andOne?.team ?? null;
    if (team === andOneRef.current) return;
    andOneRef.current = team;
    if (!team) {
      const k = andOneViewKey.current;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ref-guarded transition (slide the bar out)
      setAndOneView((v) => (v ? { ...v, phase: "out" } : null));
      setTimeout(() => setAndOneView((v) => (v && v.key === k ? null : v)), AND_ONE_EXIT);
      return;
    }
    const r = reactions.and_one as ThreesReaction | undefined;
    const favTeam = team === "a" ? game?.teamA : game?.teamB;
    const color = favTeam?.color || (team === "a" ? "#1d4ed8" : "#b91c1c");
    const k = ++andOneViewKey.current;
    // GIF is the server's pick (same on every board), not a per-client random.
    setAndOneView({ key: k, side: team, color, potential: andOne?.potential ?? 3, gif: andOne?.gif ?? null, phase: "in" });
    const soundUrl = r?.soundUrl;
    if (soundUrl) void playSound(soundUrl);
  }, [andOne, reactions, game]);

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
  // teamA = ESPN away, teamB = ESPN home → map possession/timeout onto our sides.
  const possSide: "a" | "b" | null =
    situation?.possession === "away" ? "a" : situation?.possession === "home" ? "b" : null;
  const inTimeout = liveOn && !!situation?.inTimeout;
  const timeoutSide: "a" | "b" | "official" =
    situation?.timeoutSide === "away" ? "a" : situation?.timeoutSide === "home" ? "b" : "official";
  const timeoutColor =
    timeoutSide === "a" ? game.teamA.color || "#1d4ed8" : timeoutSide === "b" ? game.teamB.color || "#b91c1c" : "#334155";

  return (
    <div
      className={styles.board}
      style={{ ["--team-a" as string]: game.teamA.color || "#1d4ed8", ["--team-b" as string]: game.teamB.color || "#b91c1c" } as React.CSSProperties}
    >
      {exitHref && (
        <Link href={exitHref} className={styles.boardExit} aria-label="Close board">×</Link>
      )}
      {!audioReady && (
        <button type="button" className={styles.audioHint} onClick={() => { unlockAudio(); setAudioReady(true); void playSound(KACHING); }}>
          🔊 Tap to enable sound
        </button>
      )}
      <div className={styles.sides}>
        {liveOn && (
          <div className={styles.scoreboard}>
            <span className={styles.sbScore} data-team="a">{liveA ?? "–"}</span>
            {statusText && <span className={styles.sbClock}>{statusText}</span>}
            <span className={styles.sbScore} data-team="b">{liveB ?? "–"}</span>
            {inTimeout && (
              <div className={styles.timeoutTag} data-side={timeoutSide} style={{ ["--to-color" as string]: timeoutColor } as React.CSSProperties}>
                Timeout
              </div>
            )}
          </div>
        )}
        <TeamHalf team={game.teamA} side="a" hot={streak.side === "a"} value={streak.value} count={streak.count} bump={landed} possession={possSide === "a"} />
        <TeamHalf team={game.teamB} side="b" hot={streak.side === "b"} value={streak.value} count={streak.count} bump={landed} possession={possSide === "b"} />

      {andOneView && (
        <>
          <div
            className={`${styles.stripe} ${styles.andOneBar}`}
            data-side={andOneView.side}
            data-phase={andOneView.phase}
            style={{ ["--stripe-color" as string]: andOneView.color } as React.CSSProperties}
          >
            <div className={styles.stripeContent}>
              <div className={styles.stripeText}>
                <div className={styles.stripeLabel}>AND 1</div>
                <div className={styles.stripeSub}>potential {andOneView.potential}-point play</div>
              </div>
            </div>
          </div>
          {andOneView.gif && (
            <div className={styles.gifCover} data-side={andOneView.side === "a" ? "b" : "a"} data-phase={andOneView.phase}>
              <img src={andOneView.gif} alt="" className={styles.gifCoverImg} />
            </div>
          )}
        </>
      )}

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
      {cover && (
        <div className={styles.gifCover} data-side={cover.side} data-phase={cover.phase}>
          <img src={cover.gif} alt="" className={styles.gifCoverImg} />
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
  possession,
}: {
  team: { name: string; shortName: string; abbrev: string | null; logo: string | null; color: string | null };
  side: "a" | "b";
  hot: boolean;
  value: number;
  count: number;
  bump: number;
  possession?: boolean;
}) {
  return (
    <div className={styles.half} data-side={side} data-hot={hot || undefined}>
      <div className={styles.halfTop}>
        {team.logo && (
          <div className={styles.halfLogoWrap} data-poss={possession || undefined}>
            <img src={team.logo} alt="" className={styles.halfLogo} />
          </div>
        )}
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
