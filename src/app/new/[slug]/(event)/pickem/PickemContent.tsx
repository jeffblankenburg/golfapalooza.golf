"use client";

import { useState } from "react";
import styles from "@/app/new/new.module.css";
import { pickIsCorrect, gameIsScored, type PickemGame } from "@/lib/v2/contests/pickem";
/* eslint-disable @next/next/no-img-element */

export interface LeaderEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  correct: number;
  decided: number;
  pickedCount: number;
  tiebreakerTotal: number | null;
  tiebreakerDiff: number | null;
  rank: number;
  picks: { gameId: string; pickedTeam: "away" | "home" | null }[] | null;
}

type MyPick = { picked: "away" | "home" | null; tiebreaker: number | null };

// The favorite's side shows "-N", the other "+N"; no spread → "PK".
function spreadFor(g: PickemGame, side: "away" | "home"): string {
  if (g.spread == null || !g.favorite) return "PK";
  const mag = Math.abs(Number(g.spread));
  return g.favorite === side ? `-${mag}` : `+${mag}`;
}

export default function PickemContent({
  eventId, games, initialPicks, leaderboard, locked, meId, totalGames,
}: {
  eventId: string;
  games: PickemGame[];
  initialPicks: Record<string, MyPick>;
  leaderboard: LeaderEntry[];
  locked: boolean;
  meId: string;
  totalGames: number;
}) {
  const [tab, setTab] = useState<"picks" | "leaderboard">("picks");
  const [picks, setPicks] = useState<Record<string, MyPick>>(initialPicks);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function save(gameId: string, next: MyPick) {
    const prev = picks[gameId];
    setPicks((s) => ({ ...s, [gameId]: next }));
    try {
      const res = await fetch(`/api/v2/events/${eventId}/pickem/pick`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, pickedTeam: next.picked, tiebreakerTotal: next.tiebreaker }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setPicks((s) => ({ ...s, [gameId]: prev ?? { picked: null, tiebreaker: null } }));
    }
  }

  const teamBtn = (g: PickemGame, side: "away" | "home") => {
    const mine = picks[g.id]?.picked ?? null;
    const on = mine === side;
    const name = side === "away" ? g.away_team : g.home_team;
    const logo = side === "away" ? g.away_logo_url : g.home_logo_url;
    const scored = gameIsScored(g);
    const correct = on && scored ? pickIsCorrect(g, side) : null;
    return (
      <button type="button" className={styles.pickTeam} data-on={on || undefined} disabled={locked}
        onClick={() => save(g.id, { picked: on ? null : side, tiebreaker: picks[g.id]?.tiebreaker ?? null })}>
        {logo && <img src={logo} alt="" className={styles.pickLogo} />}
        <span className={styles.pickTeamName}>{name}</span>
        <span className={styles.pickSpread}>{spreadFor(g, side)}</span>
        {correct === true && <span className={styles.pickMark} data-ok>✓</span>}
        {correct === false && <span className={styles.pickMark} data-bad>✗</span>}
      </button>
    );
  };

  return (
    <div className={styles.module}>
      <div className={styles.segmented} style={{ marginBottom: 14 }}>
        <button type="button" className={styles.segmentBtn} data-on={tab === "picks" || undefined} onClick={() => setTab("picks")}>My Picks</button>
        <button type="button" className={styles.segmentBtn} data-on={tab === "leaderboard" || undefined} onClick={() => setTab("leaderboard")}>Leaderboard</button>
      </div>

      {tab === "picks" ? (
        games.length === 0 ? (
          <p className={styles.dnsHint}>No games posted yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {locked && <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Picks are locked, the games have started.</p>}
            {games.map((g) => (
              <div key={g.id} className={styles.pickCard}>
                <div className={styles.pickCardMeta}>
                  {g.game_time ? new Date(g.game_time).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""}
                  {g.tv_channel ? ` · ${g.tv_channel}` : ""}
                  {g.is_tiebreaker ? "  ★ Tiebreaker" : ""}
                  {gameIsScored(g) ? `  (${g.away_score}-${g.home_score})` : ""}
                </div>
                <div className={styles.pickTeams}>
                  {teamBtn(g, "away")}
                  {teamBtn(g, "home")}
                </div>
                {g.is_tiebreaker && (
                  <div className={styles.field} style={{ marginTop: 8, marginBottom: 0 }}>
                    <label className={styles.label}>Total points (both teams)</label>
                    <input className={styles.input} inputMode="numeric" disabled={locked}
                      defaultValue={picks[g.id]?.tiebreaker != null ? String(picks[g.id]?.tiebreaker) : ""}
                      placeholder="e.g. 52"
                      onBlur={(e) => {
                        const n = e.target.value.trim() === "" ? null : Math.max(0, Math.round(Number(e.target.value)));
                        if (n !== (picks[g.id]?.tiebreaker ?? null)) save(g.id, { picked: picks[g.id]?.picked ?? null, tiebreaker: n });
                      }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      ) : (
        leaderboard.length === 0 ? (
          <p className={styles.dnsHint}>No one has made picks yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {leaderboard.map((e) => {
              const isMe = e.userId === meId;
              const canExpand = locked && e.picks && e.picks.length > 0;
              return (
                <div key={e.userId}>
                  <button type="button" className={styles.pickLeaderRow} data-me={isMe || undefined}
                    onClick={() => canExpand && setExpanded(expanded === e.userId ? null : e.userId)} disabled={!canExpand}>
                    <span className={styles.pickRank}>{e.rank}</span>
                    {e.avatarUrl ? <img src={e.avatarUrl} alt="" className={styles.pickAvatar} /> : <span className={styles.pickAvatarFallback}>{e.name.charAt(0).toUpperCase()}</span>}
                    <span className={styles.pickLeaderName}>{e.name}</span>
                    <span className={styles.pickLeaderStat}>
                      {e.decided > 0 ? `${e.correct}/${e.decided}` : `${e.pickedCount}/${totalGames} picked`}
                      {e.tiebreakerDiff != null ? ` · off ${e.tiebreakerDiff}` : ""}
                    </span>
                  </button>
                  {canExpand && expanded === e.userId && (
                    <div className={styles.pickReveal}>
                      {games.map((g) => {
                        const pk = e.picks!.find((x) => x.gameId === g.id)?.pickedTeam ?? null;
                        if (!pk) return null;
                        const ok = gameIsScored(g) ? pickIsCorrect(g, pk) : null;
                        return <span key={g.id} className={styles.pickRevealChip} data-ok={ok === true || undefined} data-bad={ok === false || undefined}>{pk === "away" ? g.away_team : g.home_team}</span>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
