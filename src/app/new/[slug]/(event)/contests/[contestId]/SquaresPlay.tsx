"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./SquaresPlay.module.css";
import SquaresGrid from "@/components/v2/contests/SquaresGrid";
import { cellKey, winningCell, type SquaresGridState, type Cell } from "@/lib/v2/contests/squares";
import { formatInstant } from "@/lib/v2/timezone";
import InfoDot from "@/app/new/_components/InfoDot";

type TeamRef = { name?: string; abbrev?: string; color?: string; logo?: string } | null;
export interface PlayGame {
  id: string;
  label: string;
  league: string;
  teamRow: TeamRef; // away (left axis)
  teamCol: TeamRef; // home (top axis)
  rowDigits: number[];
  colDigits: number[];
  locked: boolean;
  startTime: string | null;
  live: { away: number | null; home: number | null; state: string; detail: string } | null;
  periodScores: Record<string, { away: number | null; home: number | null } | null> | null;
  periodCents: Record<string, number>; // resolved dollars per period over the CURRENT sold pot
  fullBoard: { key: string; cents: number }[]; // per-period payout if the board sells out (ordered)
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;
const gameTime = (iso: string | null, timeZone: string): string =>
  formatInstant(iso, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * Which game the picker lands on by default: the live game that started earliest,
 * else the next upcoming game, else the most recent final. `games` arrives sorted
 * by start time ascending, so the first match in order is always the earliest.
 */
function defaultGameIndex(games: PlayGame[]): number {
  const live = games.findIndex((g) => g.live?.state === "in");
  if (live >= 0) return live;
  const upcoming = games.findIndex((g) => g.live?.state !== "post");
  if (upcoming >= 0) return upcoming;
  return Math.max(0, games.length - 1);
}

const mdy = (iso: string | null, timeZone: string): string =>
  formatInstant(iso, timeZone, { month: "2-digit", day: "2-digit", year: "2-digit" });

/** Dropdown label for a game — kickoff first, then matchup + score/state. */
function gameOptionLabel(x: PlayGame, timeZone: string): string {
  const m = `${x.teamRow?.abbrev ?? "Away"} @ ${x.teamCol?.abbrev ?? "Home"}`;
  const when = mdy(x.startTime, timeZone) || "TBD";
  const live = x.live;
  if (live && live.away != null && live.home != null && live.state === "post") return `${when} - ${m}, ${live.away}-${live.home} Final`;
  if (live && live.away != null && live.home != null && live.state === "in") return `${when} - ${m}, ${live.away}-${live.home}, ${live.detail || "Live"}`;
  return `${when} - ${m}`;
}

const HOW_IT_WORKS =
  "Everyone claims squares on a 10×10 grid. Once drafting closes and the board locks, each row and column is randomly assigned a digit 0-9. You win a payout whenever the last digit of each team's score lands on one of your squares.";
const SPREAD_TIP =
  "Tip: spread your squares across different rows and columns — stacking them in the same row or column gives you fewer winning number combinations.";

const PHASE_NOTE: Record<string, string> = {
  setup: "The draft hasn't opened yet.",
  primary: "Primary draft — claim your squares (up to your limit).",
  secondary: "Secondary draft — grab as many open squares as you like.",
  closed: "Picks are closed. Numbers drop soon.",
  locked: "Numbers are set. Good luck!",
  final: "This pool is final.",
};

export default function SquaresPlay({
  base,
  homeHref,
  name,
  phase,
  cellCostCents,
  maxPrimary,
  maxSecondary,
  primaryEndsAt,
  secondaryEndsAt,
  games,
  owners: propOwners,
  avatars: propAvatars,
  mine,
  myName,
  myAvatar,
  timeZone,
}: {
  // Scope-agnostic: `base` is this contest's API root, `homeHref` the back link.
  base: string;
  homeHref: string;
  name: string;
  phase: string;
  cellCostCents: number;
  maxPrimary: number;
  maxSecondary: number | null;
  primaryEndsAt: string | null;
  secondaryEndsAt: string | null;
  games: PlayGame[];
  owners: Record<string, string>;
  avatars: Record<string, string | null>;
  mine: string[];
  myName: string;
  myAvatar: string | null;
  timeZone: string;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(() => defaultGameIndex(games));
  const [err, setErr] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null); // whose square you just tapped
  // Optimistic local ownership: tapping flips a square instantly; the API
  // reconciles in the background and reverts on failure (no refresh latency).
  const [myKeys, setMyKeys] = useState<Set<string>>(() => new Set(mine));
  const [inflight, setInflight] = useState<Set<string>>(() => new Set());
  // Viewer choice: show owners as avatars (photos) or initials. Persisted per device.
  const [showAvatars, setShowAvatars] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("v2.squares.view") === "initials") setShowAvatars(false); } catch { /* ignore */ }
  }, []);
  const setView = (av: boolean) => {
    setShowAvatars(av);
    try { localStorage.setItem("v2.squares.view", av ? "avatars" : "initials"); } catch { /* ignore */ }
  };

  const buyingOpen = phase === "primary" || phase === "secondary";
  const cap = phase === "primary" ? maxPrimary : maxSecondary;
  const atCap = cap != null && myKeys.size >= cap;

  const hasPayouts = games.some((x) => x.fullBoard.some((p) => p.cents > 0));
  // Round deadlines in the event's zone, compact, with the generic zone abbreviation
  // ("ET") on each — e.g. "Feb 7, 6:00 PM ET". "TBD" until an admin sets the window.
  const roundTime = (iso: string | null): string => {
    if (!iso) return "TBD";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "TBD";
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortGeneric" }).format(d);
    } catch {
      return "TBD";
    }
  };

  // Board ownership: OTHERS come from the server; MY squares come ONLY from
  // myKeys (the optimistic truth), so the server can never resurrect a square I
  // just released nor lag a square I just claimed. Claim/release stay symmetric.
  const serverMineSet = useMemo(() => new Set(mine), [mine]);
  const owners = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [k, v] of Object.entries(propOwners)) if (!serverMineSet.has(k)) m[k] = v;
    for (const k of myKeys) m[k] = myName;
    return m;
  }, [propOwners, serverMineSet, myKeys, myName]);
  const avatars = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(propAvatars)) if (!serverMineSet.has(k)) m[k] = v;
    for (const k of myKeys) m[k] = myAvatar;
    return m;
  }, [propAvatars, serverMineSet, myKeys, myAvatar]);
  const mineSet = myKeys;
  const claimed = Object.keys(owners).length;

  const g = games[sel];
  const grid: SquaresGridState = { owners, rowDigits: g?.rowDigits ?? [], colDigits: g?.colDigits ?? [] };

  async function tap(row: number, col: number) {
    if (!buyingOpen) return;
    const k = cellKey(row, col);
    if (inflight.has(k)) return;
    const isMine = myKeys.has(k);
    const isOpen = !owners[k];
    if (!isMine && !isOpen) {
      setPeek(owners[k] ?? null); // someone else's square — reveal whose it is
      return;
    }
    if (isOpen && atCap) {
      setErr(`You're at your limit of ${cap} for this round.`);
      return;
    }
    setErr(null);
    setPeek(null);

    // Flip optimistically, then confirm with the server.
    const next = new Set(myKeys);
    if (isMine) next.delete(k);
    else next.add(k);
    setMyKeys(next);
    setInflight((s) => new Set(s).add(k));

    try {
      const res = await fetch(`${base}/squares/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isMine ? "release" : "claim", row, col }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Revert the optimistic flip.
        setMyKeys((cur) => {
          const rb = new Set(cur);
          if (isMine) rb.add(k);
          else rb.delete(k);
          return rb;
        });
        setErr(d.error || "Could not update.");
      } else {
        router.refresh(); // reconcile others' squares in the background
      }
    } catch {
      setMyKeys((cur) => {
        const rb = new Set(cur);
        if (isMine) rb.add(k);
        else rb.delete(k);
        return rb;
      });
      setErr("Something went wrong.");
    } finally {
      setInflight((s) => {
        const n = new Set(s);
        n.delete(k);
        return n;
      });
    }
  }

  const viewToggle = claimed > 0 ? (
    <div className={styles.viewToggle} role="group" aria-label="Show squares as">
      <span className={styles.viewToggleLabel}>Show as</span>
      <button type="button" className={styles.viewToggleBtn} data-on={showAvatars || undefined} onClick={() => setView(true)}>Avatars</button>
      <button type="button" className={styles.viewToggleBtn} data-on={!showAvatars || undefined} onClick={() => setView(false)}>Initials</button>
    </div>
  ) : null;

  return (
    <div className={styles.page}>
      <Link href={homeHref} className={styles.back}>← Home</Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{name}</h1>
        <InfoDot ariaLabel="How Squares works">
          <p style={{ margin: "0 0 8px" }}>{HOW_IT_WORKS}</p>
          <p style={{ margin: 0 }}>{SPREAD_TIP}</p>
        </InfoDot>
      </div>

      {buyingOpen ? (
        <>
          <div className={styles.rounds}>
            <div className={`${styles.roundsRow} ${styles.roundsHead}`}>
              <span>Round</span><span>Max picks</span><span>Closes</span>
            </div>
            <div className={styles.roundsRow} data-current={phase === "primary" || undefined}>
              <span>Round 1</span><span>{maxPrimary}</span><span>{roundTime(primaryEndsAt)}</span>
            </div>
            <div className={styles.roundsRow} data-current={phase === "secondary" || undefined}>
              <span>Round 2</span><span>{maxSecondary == null ? "Unlimited" : maxSecondary}</span><span>{roundTime(secondaryEndsAt)}</span>
            </div>
          </div>
          <p className={styles.note}>Tap an open square to claim it. Tap it again to remove it.</p>
        </>
      ) : (
        <p className={styles.note}>{PHASE_NOTE[phase] ?? ""}</p>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{claimed}/100</span>
          <span className={styles.statLabel}>claimed</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{myKeys.size}</span>
          <span className={styles.statLabel}>yours{cap != null ? ` / ${cap}` : ""}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{money(myKeys.size * cellCostCents)}</span>
          <span className={styles.statLabel}>you owe</span>
        </div>
      </div>

      {buyingOpen ? (
        <>
          {/* Drafting: a team-agnostic board (squares are owned once, across every
              game), so no teams/digits here — the games live in the list below. */}
          <div className={styles.boardWrap}>
            <SquaresGrid grid={grid} bare mine={mineSet} avatars={avatars} showAvatars={showAvatars} onCellClick={tap} />
            {err && (
              <div className={styles.boardScrim} onClick={() => setErr(null)}>
                <div className={styles.boardMsg} onClick={(e) => e.stopPropagation()}>
                  <p>{err}</p>
                  <button type="button" className={styles.boardMsgBtn} onClick={() => setErr(null)}>Got it</button>
                </div>
              </div>
            )}
          </div>
          {viewToggle}
          {peek && <p className={styles.peek}>That&apos;s <strong>{peek}</strong>&apos;s square.</p>}

          {games.length > 0 && (
            <div className={styles.gameList}>
              <div className={styles.gameListHead}>{games.length === 1 ? "The game" : `${games.length} games`}</div>
              {games.map((x) => (
                <div key={x.id} className={styles.gameItem}>
                  <span className={styles.gameTeams}>{x.teamRow?.abbrev ?? "Away"} @ {x.teamCol?.abbrev ?? "Home"}</span>
                  <span className={styles.gameWhen}>{gameTime(x.startTime, timeZone) || "Time TBD"}</span>
                </div>
              ))}
            </div>
          )}

          {hasPayouts && (
            <div className={styles.payouts}>
              <div className={styles.payoutsHead}>Payouts if the board sells out</div>
              {games.map((x) => {
                const rows = x.fullBoard.filter((p) => p.cents > 0);
                if (rows.length === 0) return null;
                return (
                  <div key={x.id} className={styles.payoutGame}>
                    {games.length > 1 && <div className={styles.payoutGameName}>{x.teamRow?.abbrev ?? "Away"} @ {x.teamCol?.abbrev ?? "Home"}</div>}
                    <div className={styles.payoutRows}>
                      {rows.map((p) => (
                        <span key={p.key} className={styles.payoutCell}>
                          <span className={styles.payoutPeriod}>{p.key}</span>
                          <strong className={styles.payoutAmt}>{money(p.cents)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className={styles.payoutNote}>Based on a full 100-square board at {money(cellCostCents)}/square. Payouts scale with how many squares sell.</p>
            </div>
          )}
        </>
      ) : (
        <>
          {games.length > 1 && (
            <select className={styles.gamePick} value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Pick a game">
              {games.map((x, i) => (
                <option key={x.id} value={i}>{gameOptionLabel(x, timeZone)}</option>
              ))}
            </select>
          )}
          {g && (() => {
            const live = g.live;
            const currentWinner: Cell | null =
              live && live.away != null && live.home != null ? winningCell(grid, live.away, live.home) : null;

            // Per-period winnings come pre-resolved from the server (flexible
            // $/%/remainder allocation over the sold pot).
            const periodWinners: { cell: Cell; label: string; amountCents: number }[] = [];
            for (const [k, v] of Object.entries(g.periodScores ?? {})) {
              if (v && v.away != null && v.home != null) {
                const cell = winningCell(grid, v.away, v.home);
                if (cell) periodWinners.push({ cell, label: k, amountCents: g.periodCents[k] ?? 0 });
              }
            }
            return (
              <>
                {/* Single-game pools have no dropdown, so keep a score bar here.
                    Multi-game pools carry the score in the dropdown label instead. */}
                {games.length === 1 && live && live.state !== "pre" && (
                  <div className={styles.scoreLine}>
                    <span className={styles.scoreTeam}>{g.teamRow?.abbrev ?? "Away"} <b>{live.away ?? "-"}</b></span>
                    <span className={styles.scoreTeam}>{g.teamCol?.abbrev ?? "Home"} <b>{live.home ?? "-"}</b></span>
                    <span className={styles.scoreState} data-live={live.state === "in" || undefined}>
                      {live.state === "in" ? live.detail || "Live" : "Final"}
                    </span>
                  </div>
                )}
                <SquaresGrid
                  grid={grid}
                  teamRow={{ label: g.teamRow?.name ?? g.teamRow?.abbrev ?? "Away", sub: "away", color: g.teamRow?.color ?? null, logo: g.teamRow?.logo ?? null }}
                  teamCol={{ label: g.teamCol?.name ?? g.teamCol?.abbrev ?? "Home", sub: "home", color: g.teamCol?.color ?? null, logo: g.teamCol?.logo ?? null }}
                  mine={mineSet}
                  avatars={avatars}
                  showAvatars={showAvatars}
                  currentWinner={currentWinner}
                  periodWinners={periodWinners}
                />
                {viewToggle}
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
