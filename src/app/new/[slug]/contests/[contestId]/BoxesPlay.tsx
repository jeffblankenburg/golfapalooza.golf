"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./BoxesPlay.module.css";
import BoxesGrid from "@/components/v2/contests/BoxesGrid";
import { cellKey, winningCell, type BoxesGridState, type Cell } from "@/lib/v2/contests/boxes";

export interface PlayGame {
  id: string;
  label: string;
  teamRow: { abbrev?: string } | null;
  teamCol: { abbrev?: string } | null;
  rowDigits: number[];
  colDigits: number[];
  locked: boolean;
  startTime: string | null;
  live: { away: number | null; home: number | null; state: string; detail: string } | null;
  periodScores: Record<string, { away: number | null; home: number | null } | null> | null;
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;
const gameTime = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
};

const PHASE_NOTE: Record<string, string> = {
  setup: "The draft hasn't opened yet.",
  primary: "Primary draft — claim your squares (up to your limit).",
  secondary: "Secondary draft — grab as many open squares as you like.",
  closed: "Picks are closed. Numbers drop soon.",
  locked: "Numbers are set. Good luck!",
  final: "This pool is final.",
};

export default function BoxesPlay({
  orgId,
  slug,
  contestId,
  name,
  phase,
  cellCostCents,
  maxPrimary,
  maxSecondary,
  games,
  owners: propOwners,
  avatars: propAvatars,
  mine,
  myName,
  myAvatar,
}: {
  orgId: string;
  slug: string;
  contestId: string;
  name: string;
  phase: string;
  cellCostCents: number;
  maxPrimary: number;
  maxSecondary: number | null;
  games: PlayGame[];
  owners: Record<string, string>;
  avatars: Record<string, string | null>;
  mine: string[];
  myName: string;
  myAvatar: string | null;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [peek, setPeek] = useState<string | null>(null); // whose square you just tapped
  // Optimistic local ownership: tapping flips a square instantly; the API
  // reconciles in the background and reverts on failure (no refresh latency).
  const [myKeys, setMyKeys] = useState<Set<string>>(() => new Set(mine));
  const [inflight, setInflight] = useState<Set<string>>(() => new Set());

  const buyingOpen = phase === "primary" || phase === "secondary";
  const cap = phase === "primary" ? maxPrimary : maxSecondary;
  const atCap = cap != null && myKeys.size >= cap;

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
  const grid: BoxesGridState = { owners, rowDigits: g?.rowDigits ?? [], colDigits: g?.colDigits ?? [] };

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
      const res = await fetch(`/api/v2/orgs/${orgId}/contests/${contestId}/boxes/claim`, {
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

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}`} className={styles.back}>← Home</Link>
      <h1 className={styles.title}>{name}</h1>
      <p className={styles.note}>{PHASE_NOTE[phase] ?? ""}</p>

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

      {err && <p className={styles.err}>{err}</p>}

      {buyingOpen ? (
        <>
          {/* Drafting: a team-agnostic board (squares are owned once, across every
              game), so no teams/digits here — the games live in the list below. */}
          <BoxesGrid grid={grid} bare mine={mineSet} avatars={avatars} onCellClick={tap} />
          {peek && <p className={styles.peek}>That&apos;s <strong>{peek}</strong>&apos;s square.</p>}
          <p className={styles.help}>Tap an open square to claim it. Tap one of yours to release it, or someone else&apos;s to see who it is.</p>

          {games.length > 0 && (
            <div className={styles.gameList}>
              <div className={styles.gameListHead}>{games.length === 1 ? "The game" : `${games.length} games`}</div>
              {games.map((x) => (
                <div key={x.id} className={styles.gameItem}>
                  <span className={styles.gameTeams}>{x.teamRow?.abbrev ?? "Away"} @ {x.teamCol?.abbrev ?? "Home"}</span>
                  <span className={styles.gameWhen}>{gameTime(x.startTime) || "Time TBD"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {games.length > 1 && (
            <div className={styles.tabs}>
              {games.map((x, i) => (
                <button key={x.id} type="button" className={styles.tab} data-on={i === sel || undefined} onClick={() => setSel(i)}>
                  {x.label}
                </button>
              ))}
            </div>
          )}
          {g && (() => {
            const live = g.live;
            const currentWinner: Cell | null =
              live && live.away != null && live.home != null ? winningCell(grid, live.away, live.home) : null;
            const periodWinners: { cell: Cell; label: string }[] = [];
            for (const [k, v] of Object.entries(g.periodScores ?? {})) {
              if (v && v.away != null && v.home != null) {
                const cell = winningCell(grid, v.away, v.home);
                if (cell) periodWinners.push({ cell, label: k });
              }
            }
            return (
              <>
                {live && live.state !== "pre" && (
                  <div className={styles.scoreLine}>
                    <span className={styles.scoreTeam}>{g.teamRow?.abbrev ?? "Away"} <b>{live.away ?? "-"}</b></span>
                    <span className={styles.scoreTeam}>{g.teamCol?.abbrev ?? "Home"} <b>{live.home ?? "-"}</b></span>
                    <span className={styles.scoreState} data-live={live.state === "in" || undefined}>
                      {live.state === "in" ? live.detail || "Live" : "Final"}
                    </span>
                  </div>
                )}
                <BoxesGrid
                  grid={grid}
                  teamRow={{ label: g.teamRow?.abbrev ?? "Away" }}
                  teamCol={{ label: g.teamCol?.abbrev ?? "Home" }}
                  mine={mineSet}
                  currentWinner={currentWinner}
                  periodWinners={periodWinners}
                />
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}
