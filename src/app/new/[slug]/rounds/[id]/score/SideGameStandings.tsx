"use client";

import { useState } from "react";
import styles from "./score.module.css";
import { computeSkins } from "@/lib/v2/rounds/skins";
import { computeNassau } from "@/lib/v2/rounds/nassau";
import { computeSixSixSix, sixesNetUnits } from "@/lib/v2/rounds/sixes";
import { settleUp } from "@/lib/v2/rounds/settle";
import GameSettingsModal from "./GameSettingsModal";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export interface RoundGame {
  id: string;
  game_type: string;
  is_net: boolean;
  participant_ids: string[];
  value: number | null; // optional $ stake per skin / per bet
}

const money = (n: number) => `$${n % 1 === 0 ? n : n.toFixed(2)}`;

function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={styles.sideGameGear} onClick={onClick} aria-label="Game settings">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </button>
  );
}

/**
 * Live side-game standings on the scorer (#183). Derived from the current scores,
 * so it re-computes on every entry. Each card has a gear to edit stake, gross/net,
 * or roster mid-round.
 */
export default function SideGameStandings({
  games,
  playerNames,
  holeNumbers,
  gross,
  strokesByPlayer = {},
  roundId,
  rosterOrder,
  brandColor,
  onGameSaved,
  onGameRemoved,
}: {
  games: RoundGame[];
  playerNames: Record<string, string>;
  holeNumbers: number[];
  gross: Record<string, Record<number, number>>;
  strokesByPlayer?: Record<string, Record<number, number>>;
  roundId: string;
  rosterOrder: string[];
  brandColor: string;
  onGameSaved: (g: RoundGame) => void;
  onGameRemoved: (id: string) => void;
}) {
  const [editing, setEditing] = useState<RoundGame | null>(null);
  const skins = games.filter((g) => g.game_type === "skins");
  const nassau = games.filter((g) => g.game_type === "nassau");
  const sixes = games.filter((g) => g.game_type === "sixes");
  if (skins.length === 0 && nassau.length === 0 && sixes.length === 0) return null;

  // Net: subtract each player's per-hole handicap strokes before scoring.
  const netScores = (): Record<string, Record<number, number>> => {
    const out: Record<string, Record<number, number>> = {};
    for (const pid in gross) {
      const m: Record<number, number> = {};
      for (const h in gross[pid]) {
        const strokes = strokesByPlayer[pid]?.[Number(h)] ?? 0;
        m[Number(h)] = gross[pid][Number(h)] - strokes;
      }
      out[pid] = m;
    }
    return out;
  };

  return (
    <div className={styles.sideGames}>
      {skins.map((g) => {
        const scores = g.is_net ? netScores() : gross;
        const r = computeSkins(holeNumbers, scores, g.participant_ids);
        // Each skin is worth `stake` from every OTHER player, so a player's net is
        // stake × (theirSkins × N − totalSkins). Sums to zero across the table.
        const n = g.participant_ids.length;
        const totalSkins = g.participant_ids.reduce((sum, id) => sum + (r.wonBy[id] ?? 0), 0);
        const standings = g.participant_ids
          .map((id) => {
            const won = r.wonBy[id] ?? 0;
            return { id, name: playerNames[id] || "Player", won, net: g.value ? g.value * (won * n - totalSkins) : 0 };
          })
          .sort((a, b) => b.won - a.won);
        return (
          <div key={g.id} className={styles.sideGame}>
            <div className={styles.sideGameHead}>
              <span className={styles.sideGameTitle}>
                Skins{g.is_net ? " (Net)" : ""}
                {g.value ? <span className={styles.sideGameStake}> {money(g.value)}/skin</span> : null}
              </span>
              {r.carrying > 0 && <span className={styles.sideGameCarry}>{r.carrying} carrying</span>}
              <span className={styles.sideGameThru}>{r.resolved > 0 ? `thru ${r.resolved}` : "not started"}</span>
              <GearButton onClick={() => setEditing(g)} />
            </div>
            <div className={styles.sideGameGrid}>
              {standings.map((s) => (
                <div key={s.id} className={styles.sideGameTile}>
                  <div className={styles.sideGameTileTop}>
                    <span className={styles.sideGameTileName}>{s.name}</span>
                    {g.value ? <span className={styles.sideGameTileSkins}>{s.won === 1 ? "1 skin" : `${s.won} skins`}</span> : null}
                  </div>
                  {g.value ? (
                    <span className={s.net > 0 ? styles.sideGameTileUp : s.net < 0 ? styles.sideGameTileDown : styles.sideGameTileEven}>
                      {money(Math.abs(s.net))}
                    </span>
                  ) : (
                    <span className={styles.sideGameTileEven}>
                      {s.won} <span className={styles.sideGameTileSkinsInline}>{s.won === 1 ? "skin" : "skins"}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {nassau.map((g) => {
        const [a, b] = g.participant_ids;
        if (!a || !b) {
          return (
            <div key={g.id} className={styles.sideGame}>
              <div className={styles.sideGameHead}>
                <span className={styles.sideGameTitle}>Nassau{g.is_net ? " (Net)" : ""}</span>
                <span className={styles.sideGameThru} />
                <GearButton onClick={() => setEditing(g)} />
              </div>
              <div className={styles.sideGameRows}>
                <span className={styles.sideGameName}>Needs two players.</span>
              </div>
            </div>
          );
        }
        const scores = g.is_net ? netScores() : gross;
        const r = computeNassau(holeNumbers, scores, a, b);
        // Each segment is its own bet worth the stake; net them into one settlement.
        let net = 0; // + = a ahead in dollars
        if (g.value) {
          for (const s of r.segments) {
            if (s.leader === a) net += g.value;
            else if (s.leader === b) net -= g.value;
          }
        }
        const winner = net > 0 ? a : b;
        const loser = net > 0 ? b : a;
        return (
          <div key={g.id} className={styles.sideGame}>
            <div className={styles.sideGameHead}>
              <span className={styles.sideGameTitle}>
                {firstName(playerNames[a] || "A")} v {firstName(playerNames[b] || "B")}
                <span className={styles.sideGameStake}> ({g.is_net ? "Net" : "Raw"})</span>
              </span>
              <span className={styles.sideGameThru}>
                Nassau
                {g.value ? <span className={styles.sideGameStake}> {money(g.value)}/bet</span> : null}
              </span>
              <GearButton onClick={() => setEditing(g)} />
            </div>
            <div className={styles.sideGameSegs} data-single={r.segments.length === 1 || undefined}>
              {r.segments.map((s) => {
                const name = s.leader ? firstName(playerNames[s.leader] || "") : "";
                const text = !s.leader
                  ? "AS"
                  : s.closeout
                    ? `${name} ${s.up}&${s.remaining}`
                    : s.complete
                      ? `${name} ${s.up} up`
                      : `${name} ${s.up}▲`;
                return (
                  <div key={s.key} className={styles.sideGameSeg}>
                    <span className={styles.sideGameSegLabel}>{s.label}</span>
                    <span className={s.leader ? styles.sideGameSegVal : styles.sideGameSegSquare}>{text}</span>
                    {s.dormie && <span className={styles.sideGameDormie}>dormie</span>}
                    {s.decided && s.leader && <span className={styles.sideGameFinal}>final</span>}
                  </div>
                );
              })}
            </div>
            {g.value && (
              <div className={styles.sideGameSettle}>
                {net !== 0
                  ? `${firstName(playerNames[loser] || "")} pays ${firstName(playerNames[winner] || "")} ${money(Math.abs(net))}`
                  : "All square"}
              </div>
            )}
          </div>
        );
      })}

      {sixes.map((g) => {
        const scores = g.is_net ? netScores() : gross;
        const players = g.participant_ids;
        if (players.length !== 4) {
          return (
            <div key={g.id} className={styles.sideGame}>
              <div className={styles.sideGameHead}>
                <span className={styles.sideGameTitle}>6-6-6</span>
                <span className={styles.sideGameThru} />
                <GearButton onClick={() => setEditing(g)} />
              </div>
              <div className={styles.sideGameRows}>
                <span className={styles.sideGameName}>Needs four players.</span>
              </div>
            </div>
          );
        }
        const r = computeSixSixSix(holeNumbers, scores, players);
        const teamLabel = (team: string[]) => `${firstName(playerNames[team[0]] || "")}+${firstName(playerNames[team[1]] || "")}`;
        const units = g.value ? sixesNetUnits(r, players) : null;
        return (
          <div key={g.id} className={styles.sideGame}>
            <div className={styles.sideGameHead}>
              <span className={styles.sideGameTitle}>
                6-6-6
                <span className={styles.sideGameStake}> ({g.is_net ? "Net" : "Raw"})</span>
              </span>
              <span className={styles.sideGameThru}>
                {g.value ? <span className={styles.sideGameStake}>{money(g.value)}/seg</span> : null}
              </span>
              <GearButton onClick={() => setEditing(g)} />
            </div>
            <div className={styles.sixesRows}>
              {r.segments.map((s) => {
                const winTeam = s.leader === "A" ? s.teamA : s.leader === "B" ? s.teamB : null;
                const result = !winTeam
                  ? "AS"
                  : s.closeout
                    ? `${teamLabel(winTeam)} ${s.up}&${s.remaining}`
                    : s.complete
                      ? `${teamLabel(winTeam)} ${s.up} up`
                      : `${teamLabel(winTeam)} ${s.up}▲`;
                return (
                  <div key={s.key} className={styles.sixesRow}>
                    <span className={styles.sixesLabel}>{s.label}</span>
                    <span className={styles.sixesMatch}>
                      {teamLabel(s.teamA)} v {teamLabel(s.teamB)}
                    </span>
                    <span className={winTeam ? styles.sixesResult : styles.sixesResultSquare}>
                      {result}
                      {s.dormie && <span className={styles.sideGameDormie}> dormie</span>}
                      {s.decided && winTeam && <span className={styles.sideGameFinal}> final</span>}
                    </span>
                  </div>
                );
              })}
            </div>
            {units &&
              (() => {
                const netById = Object.fromEntries(players.map((id) => [id, (units[id] ?? 0) * (g.value ?? 0)]));
                const transfers = settleUp(netById);
                if (transfers.length === 0) return <div className={styles.sideGameSettle}>All square</div>;
                // One box per player who owes — "amount/recipient" (a debtor may owe two).
                const byPayer = new Map<string, { to: string; amount: number }[]>();
                for (const t of transfers) {
                  if (!byPayer.has(t.from)) byPayer.set(t.from, []);
                  byPayer.get(t.from)!.push({ to: t.to, amount: t.amount });
                }
                return (
                  <div className={`${styles.sideGameGrid} ${styles.sixesDebts}`}>
                    {[...byPayer.entries()].map(([from, list]) => (
                      <div key={from} className={styles.sideGameTile} data-settle="down">
                        <div className={styles.sideGameTileTop}>
                          <span className={styles.sideGameTileName}>{playerNames[from] || "Player"}</span>
                        </div>
                        <div className={styles.sideGamePayRow}>
                          {list.map((t, i) => (
                            <span key={i} className={styles.sideGamePayChip}>
                              <span className={styles.sideGamePayAmt}>{money(t.amount)}</span>
                              <span className={styles.sideGamePayTo}>{firstName(playerNames[t.to] || "")}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
          </div>
        );
      })}

      {editing && (
        <GameSettingsModal
          game={editing}
          playerNames={playerNames}
          rosterOrder={rosterOrder}
          roundId={roundId}
          brandColor={brandColor}
          onSaved={(g) => {
            onGameSaved(g);
            setEditing(null);
          }}
          onRemoved={(id) => {
            onGameRemoved(id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
