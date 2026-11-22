"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import { subscribeToPickem } from "@/lib/v2/realtime/pickem-channel";
import { pickIsCorrect, gameIsScored, pickemTeamLabel, type PickemGame } from "@/lib/v2/contests/pickem";
import { placeLabel } from "@/lib/v2/contests/payouts";
import { formatInstant } from "@/lib/v2/timezone";
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
  provisionalCents: number; // "if it ends now" winnings (0 = not in the money / no result yet)
  picks: { gameId: string; pickedTeam: "away" | "home" | null }[] | null;
}

type MyPick = { picked: "away" | "home" | null; tiebreaker: number | null };

// Whole-dollar pots render without cents; a stray odd cent (rare, from a tie split) keeps 2dp.
function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

// The favorite's side shows "-N", the other "+N"; no spread → "PK".
function spreadFor(g: PickemGame, side: "away" | "home"): string {
  if (g.spread == null || !g.favorite) return "PK";
  const mag = Math.abs(Number(g.spread));
  return g.favorite === side ? `-${mag}` : `+${mag}`;
}

export default function PickemContent({
  contestId, pickUrl, games, initialPicks, leaderboard, lockedGameIds, allLocked, meId, totalGames,
  timeZone, potCents = 0, placePayouts = [],
}: {
  // Scope-agnostic: the mount supplies the endpoint to POST a pick to (event-
  // scoped or group-scoped). The pick UI is identical in either case.
  contestId: string;
  pickUrl: string;
  timeZone: string;        // event/org zone for displaying game times
  games: PickemGame[];
  initialPicks: Record<string, MyPick>;
  leaderboard: LeaderEntry[];
  lockedGameIds: string[]; // games whose picking is closed (per the contest's lock mode)
  allLocked: boolean;      // every game has started
  meId: string;
  totalGames: number;
  potCents?: number;                                        // entry × entrants (0 = free pool)
  placePayouts?: { place: number; amountCents: number }[];  // prize structure over the current pot
}) {
  const [tab, setTab] = useState<"picks" | "leaderboard">("picks");
  const [picks, setPicks] = useState<Record<string, MyPick>>(initialPicks);
  const [expanded, setExpanded] = useState<string | null>(null);
  const lockedGames = new Set(lockedGameIds);
  const router = useRouter();

  // Keep the board live via realtime: scores landing, picks coming in, payout edits, and
  // entrant/pot changes all push a refresh, which re-renders the server component with fresh
  // standings/pot/winnings. Local pick state is preserved across the refresh.
  useEffect(() => {
    const unsub = subscribeToPickem(contestId, () => router.refresh());
    return () => { unsub(); };
  }, [contestId, router]);

  async function save(gameId: string, next: MyPick) {
    const prev = picks[gameId];
    setPicks((s) => ({ ...s, [gameId]: next }));
    try {
      const res = await fetch(pickUrl, {
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
    const covered = scored && pickIsCorrect(g, side) === true; // this side covered
    const myResult = on && scored ? pickIsCorrect(g, side) : null; // my pick right/wrong
    const score = side === "away" ? g.away_score : g.home_score;
    return (
      <button type="button" className={styles.pickTeam} data-on={on || undefined} data-win={covered || undefined} disabled={lockedGames.has(g.id)}
        onClick={() => save(g.id, { picked: on ? null : side, tiebreaker: picks[g.id]?.tiebreaker ?? null })}>
        {logo && <img src={logo} alt="" className={styles.pickLogo} />}
        <span className={styles.pickTeamName}>{name}</span>
        <span className={styles.pickSpread}>{spreadFor(g, side)}</span>
        {scored && <span className={styles.pickTeamScore}>{score}</span>}
        {myResult === true && <span className={styles.pickMark} data-ok>✓</span>}
        {myResult === false && <span className={styles.pickMark} data-bad>✗</span>}
      </button>
    );
  };

  // A tiebreaker only matters when players are tied on correct picks — count how
  // many share each correct total so we only explain the tiebreaker where it's used.
  const sameCorrect = new Map<number, number>();
  for (const e of leaderboard) if (e.decided > 0) sameCorrect.set(e.correct, (sameCorrect.get(e.correct) || 0) + 1);

  // Money display. The banner (pot + prize structure) shows whenever there's a pot.
  // Per-row winnings + the "payout line" only appear once a result lands — before then
  // everyone's tied at 0, so "who's in the money" is meaningless. allScored → settled
  // ("won"); otherwise projected ("if it ends now").
  const payingPlaces = placePayouts.filter((p) => p.amountCents > 0);
  const hasMoney = potCents > 0 && payingPlaces.length > 0;
  const anyScored = games.some(gameIsScored);
  const allScored = games.length > 0 && games.every(gameIsScored);
  const showWinnings = hasMoney && anyScored;
  const me = leaderboard.find((e) => e.userId === meId);
  // The payout line sits before the first out-of-the-money player (only when someone's in).
  const cutIdx =
    showWinnings && leaderboard.some((e) => e.provisionalCents > 0)
      ? leaderboard.findIndex((e) => e.provisionalCents === 0)
      : -1;

  // Ties: a rank held by more than one player splits the places they occupy (e.g. two tied
  // for 1st share 1st + 2nd), so a winning amount that isn't a headline prize ($10 when the
  // prizes are $15 / $5) is a split. Mark the rank "T1" so that reads as an obvious tie
  // rather than a mystery number. Only meaningful once results exist (before then everyone's
  // trivially tied at 0). The split math itself lives server-side in distributePlacePayouts.
  const rankCount = new Map<number, number>();
  for (const e of leaderboard) rankCount.set(e.rank, (rankCount.get(e.rank) ?? 0) + 1);
  const isTie = (rank: number) => anyScored && (rankCount.get(rank) ?? 0) > 1;
  const rankText = (rank: number) => (isTie(rank) ? `T${rank}` : String(rank));
  const rankPhrase = (rank: number) => `${isTie(rank) ? "tied for " : ""}${ordinal(rank)}`;

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
            {allLocked && <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Picks are locked, the games have started.</p>}
            {games.map((g) => (
              <div key={g.id} className={styles.pickCard}>
                <div className={styles.pickCardMeta}>
                  {g.game_time ? formatInstant(g.game_time, timeZone, { weekday: "short", hour: "numeric", minute: "2-digit" }) : ""}
                  {g.tv_channel ? `, ${g.tv_channel}` : ""}
                  {g.is_tiebreaker ? "  ★ Tiebreaker" : ""}
                </div>
                <div className={styles.pickTeams}>
                  {teamBtn(g, "away")}
                  {teamBtn(g, "home")}
                </div>
                {g.is_tiebreaker && (
                  <div className={styles.field} style={{ marginTop: 8, marginBottom: 0 }}>
                    <label className={styles.label}>Total points (both teams)</label>
                    <input className={styles.input} inputMode="numeric" disabled={lockedGames.has(g.id)}
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
            {hasMoney && (
              <div className={styles.pickPot}>
                <span className={styles.pickPotTotal}>{money(potCents)} pot</span>
                <div className={styles.pickPotPlaces}>
                  {payingPlaces.map((p) => (
                    <span key={p.place} className={styles.pickPotPlace}>
                      <span className={styles.pickPotAmt}>{money(p.amountCents)}</span>
                      <span className={styles.pickPotLbl}>{placeLabel(p.place)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {me && showWinnings && (
              <p className={styles.pickYouMoney} data-in={me.provisionalCents > 0 || undefined}>
                {me.provisionalCents > 0
                  ? (allScored
                      ? <>You won <strong>{money(me.provisionalCents)}</strong> ({rankPhrase(me.rank)})</>
                      : <>You&apos;re {rankPhrase(me.rank)}, on track to win <strong>{money(me.provisionalCents)}</strong></>)
                  : (allScored
                      ? <>You finished {rankPhrase(me.rank)}, out of the money</>
                      : <>You&apos;re {rankPhrase(me.rank)}, outside the paying places</>)}
              </p>
            )}

            {hasMoney && anyScored && !allScored && (
              <p className={styles.pickMoneyNote}>Winnings are projected if the games ended now.</p>
            )}

            {leaderboard.map((e, idx) => {
              const isMe = e.userId === meId;
              const canExpand = !!e.picks && e.picks.length > 0;
              return (
                <div key={e.userId}>
                  {idx === cutIdx && (
                    <div className={styles.pickCutLine}><span>Payout line</span></div>
                  )}
                  <button type="button" className={styles.pickLeaderRow} data-me={isMe || undefined}
                    onClick={() => canExpand && setExpanded(expanded === e.userId ? null : e.userId)} disabled={!canExpand}>
                    <span className={styles.pickRank}>{rankText(e.rank)}</span>
                    {e.avatarUrl ? <img src={e.avatarUrl} alt="" className={styles.pickAvatar} /> : <span className={styles.pickAvatarFallback}>{e.name.charAt(0).toUpperCase()}</span>}
                    <span className={styles.pickLeaderName}>{e.name}</span>
                    {showWinnings && e.provisionalCents > 0 && (
                      <span className={styles.pickMoney} title={allScored ? "Winnings" : "Projected if it ends now"}>{money(e.provisionalCents)}</span>
                    )}
                    <span className={styles.pickLeaderStat}>
                      {e.decided > 0 ? (
                        <>
                          <span className={styles.pickLeaderScore}>{e.correct}</span>
                          {(sameCorrect.get(e.correct) ?? 0) > 1 && e.tiebreakerDiff != null && (
                            <span className={styles.pickLeaderTb}>off {e.tiebreakerDiff}</span>
                          )}
                        </>
                      ) : (
                        `${e.pickedCount}/${totalGames} picked`
                      )}
                    </span>
                  </button>
                  {canExpand && expanded === e.userId && (
                    <div className={styles.pickReveal}>
                      {games.map((g) => {
                        const pk = e.picks!.find((x) => x.gameId === g.id)?.pickedTeam ?? null;
                        if (!pk) return null;
                        const ok = gameIsScored(g) ? pickIsCorrect(g, pk) : null;
                        return <span key={g.id} className={styles.pickRevealChip} data-ok={ok === true || undefined} data-bad={ok === false || undefined}>{pickemTeamLabel(g, pk)}</span>;
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
