"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import styles from "./score.module.css";
import { computeSkins } from "@/lib/v2/rounds/skins";
import { computeChairman } from "@/lib/v2/rounds/chairman";
import { computeWolf, type WolfDecision, type WolfTiebreak } from "@/lib/v2/rounds/wolf";
import { computeNassau } from "@/lib/v2/rounds/nassau";
import { computeSixSixSix, sixesNetUnits } from "@/lib/v2/rounds/sixes";
import { computeVegas, vegasNet, type VegasHole } from "@/lib/v2/rounds/vegas";
import { settleUp } from "@/lib/v2/rounds/settle";
import { GameRulesInfoButton } from "@/components/v2/games/GameRulesModal";
import GameSettingsModal from "./GameSettingsModal";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export interface RoundGame {
  id: string;
  game_type: string;
  is_net: boolean;
  participant_ids: string[];
  value: number | null; // optional $ stake per skin / per bet
  carry?: boolean; // skins only — roll tied skins to the next hole (default off)
  decisions?: Record<string, { partner?: string; lone?: boolean }>; // wolf only — per-hole Wolf pick
  tiebreak?: WolfTiebreak; // wolf only — best-ball tie rule (default "push")
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
 * Settlement rendered as boxes only: one box per player who owes, each showing the
 * amount stacked over the small recipient name(s). Shared by 6-6-6 and Vegas.
 */
function DebtBoxes({ netById, playerNames }: { netById: Record<string, number>; playerNames: Record<string, string> }) {
  const transfers = settleUp(netById);
  if (transfers.length === 0) return <div className={styles.sideGameSettle}>All square</div>;
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
            <span className={styles.sideGameTileName}>{playerNames[from] || "Player"} owes</span>
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
  parByHole = {},
  roundId,
  rosterOrder,
  brandColor = "#0a5c36",
  readOnly = false,
  onGameSaved,
  onGameRemoved,
}: {
  games: RoundGame[];
  playerNames: Record<string, string>;
  holeNumbers: number[];
  gross: Record<string, Record<number, number>>;
  strokesByPlayer?: Record<string, Record<number, number>>;
  parByHole?: Record<number, number>;
  roundId: string;
  rosterOrder: string[];
  brandColor?: string;
  readOnly?: boolean; // completed-round detail: show results, no editing
  onGameSaved?: (g: RoundGame) => void;
  onGameRemoved?: (id: string) => void;
}) {
  const [editing, setEditing] = useState<RoundGame | null>(null);
  const [vegasPop, setVegasPop] = useState<{ ph: VegasHole; teamA: string[]; teamB: string[]; x: number; y: number } | null>(null);
  const skins = games.filter((g) => g.game_type === "skins");
  const chairman = games.filter((g) => g.game_type === "chairman");
  const wolf = games.filter((g) => g.game_type === "wolf");
  const nassau = games.filter((g) => g.game_type === "nassau");
  const sixes = games.filter((g) => g.game_type === "sixes");
  const vegas = games.filter((g) => g.game_type === "vegas");
  if (skins.length === 0 && chairman.length === 0 && wolf.length === 0 && nassau.length === 0 && sixes.length === 0 && vegas.length === 0) return null;

  // Normalize a game's stored per-hole Wolf picks (string-keyed JSON) into the
  // number-keyed shape the scorer computes from.
  const wolfDecisions = (g: RoundGame): Record<number, WolfDecision> => {
    const out: Record<number, WolfDecision> = {};
    for (const [k, v] of Object.entries(g.decisions ?? {})) {
      if (v?.lone) out[Number(k)] = { lone: true };
      else if (typeof v?.partner === "string") out[Number(k)] = { partner: v.partner };
    }
    return out;
  };

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
        const r = computeSkins(holeNumbers, scores, g.participant_ids, g.carry === true);
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
                <GameRulesInfoButton gameType={g.game_type} />
                Skins{g.is_net ? " (Net)" : ""}
                {g.value ? <span className={styles.sideGameStake}> {money(g.value)}/skin</span> : null}
              </span>
              {r.carrying > 0 && <span className={styles.sideGameCarry}>{r.carrying} carrying</span>}
              <span className={styles.sideGameThru}>{r.resolved > 0 ? `thru ${r.resolved}` : "not started"}</span>
              {!readOnly && <GearButton onClick={() => setEditing(g)} />}
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

      {chairman.map((g) => {
        const scores = g.is_net ? netScores() : gross;
        const r = computeChairman(holeNumbers, scores, g.participant_ids);
        // Each point is worth `stake` from every OTHER player, so a player's net is
        // stake × (theirPts × N − totalPts). Sums to zero across the table (same
        // peer-to-peer settlement as Skins).
        const n = g.participant_ids.length;
        const totalPts = g.participant_ids.reduce((sum, id) => sum + (r.points[id] ?? 0), 0);
        const standings = g.participant_ids
          .map((id) => {
            const pts = r.points[id] ?? 0;
            // The holes where this player defended the chair for a point — shown in
            // their box so you can see exactly where the points came from.
            const pointHoles = r.perHole.filter((ph) => ph.point && ph.winner === id).map((ph) => ph.hole_number);
            return { id, name: playerNames[id] || "Player", pts, pointHoles, net: g.value ? g.value * (pts * n - totalPts) : 0 };
          })
          .sort((a, b) => b.pts - a.pts);
        return (
          <div key={g.id} className={styles.sideGame}>
            <div className={styles.sideGameHead}>
              <span className={styles.sideGameTitle}>
                <GameRulesInfoButton gameType={g.game_type} />
                Chairman{g.is_net ? " (Net)" : ""}
                {g.value ? <span className={styles.sideGameStake}> {money(g.value)}/pt</span> : null}
              </span>
              {r.chairman && <span className={styles.sideGameCarry}>{firstName(playerNames[r.chairman] || "")} holds</span>}
              <span className={styles.sideGameThru}>{r.resolved > 0 ? `thru ${r.resolved}` : "not started"}</span>
              {!readOnly && <GearButton onClick={() => setEditing(g)} />}
            </div>
            <div className={styles.sideGameGrid}>
              {standings.map((s) => (
                <div key={s.id} className={styles.sideGameTile} data-chair={s.id === r.chairman || undefined}>
                  <div className={styles.sideGameTileTop}>
                    <span className={styles.sideGameTileName}>{s.name}</span>
                    {g.value ? <span className={styles.sideGameTileSkins}>{s.pts === 1 ? "1 pt" : `${s.pts} pts`}</span> : null}
                  </div>
                  {g.value ? (
                    <span className={s.net > 0 ? styles.sideGameTileUp : s.net < 0 ? styles.sideGameTileDown : styles.sideGameTileEven}>
                      {money(Math.abs(s.net))}
                    </span>
                  ) : (
                    <span className={styles.sideGameTileEven}>
                      {s.pts} <span className={styles.sideGameTileSkinsInline}>{s.pts === 1 ? "pt" : "pts"}</span>
                    </span>
                  )}
                  {s.pointHoles.length > 0 && (
                    <div className={styles.sideGameTileHoles} aria-label={`Points won on holes ${s.pointHoles.join(", ")}`}>
                      {s.pointHoles.map((h) => (
                        <span key={h} className={styles.sideGameHoleChip}>{h}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {wolf.map((g) => {
        const scores = g.is_net ? netScores() : gross;
        const r = computeWolf(holeNumbers, scores, g.participant_ids, wolfDecisions(g), holeNumbers.length === 18, g.tiebreak ?? "push");
        // Wolf points are already zero-sum per player (winners +, losers −), so the
        // dollar net is simply points × stake (no cross-table normalization needed).
        const standings = g.participant_ids
          .map((id) => {
            const pts = r.points[id] ?? 0;
            return { id, name: playerNames[id] || "Player", pts, net: g.value ? g.value * pts : 0 };
          })
          .sort((a, b) => b.pts - a.pts);
        const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
        return (
          <div key={g.id} className={styles.sideGame}>
            <div className={styles.sideGameHead}>
              <span className={styles.sideGameTitle}>
                <GameRulesInfoButton gameType={g.game_type} />
                Wolf{g.is_net ? " (Net)" : ""}
                {g.value ? <span className={styles.sideGameStake}> {money(g.value)}/pt</span> : null}
              </span>
              {r.pendingPicks.length > 0 && (
                <span className={styles.sideGameCarry}>{r.pendingPicks.length} need a pick</span>
              )}
              <span className={styles.sideGameThru}>{r.decidedCount > 0 ? `thru ${r.decidedCount}` : "not started"}</span>
              {!readOnly && <GearButton onClick={() => setEditing(g)} />}
            </div>
            <div className={styles.sideGameGrid}>
              {standings.map((s) => (
                <div key={s.id} className={styles.sideGameTile}>
                  <div className={styles.sideGameTileTop}>
                    <span className={styles.sideGameTileName}>{s.name}</span>
                    {g.value ? (
                      <span className={styles.sideGameTileSkins}>
                        {signed(s.pts)} pt{Math.abs(s.pts) === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                  {g.value ? (
                    <span className={s.net > 0 ? styles.sideGameTileUp : s.net < 0 ? styles.sideGameTileDown : styles.sideGameTileEven}>
                      {s.net < 0 ? `-${money(Math.abs(s.net))}` : money(s.net)}
                    </span>
                  ) : (
                    <span className={s.pts > 0 ? styles.sideGameTileUp : s.pts < 0 ? styles.sideGameTileDown : styles.sideGameTileEven}>
                      {signed(s.pts)} <span className={styles.sideGameTileSkinsInline}>pt{Math.abs(s.pts) === 1 ? "" : "s"}</span>
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
                {!readOnly && <GearButton onClick={() => setEditing(g)} />}
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
                <GameRulesInfoButton gameType={g.game_type} />
                {firstName(playerNames[a] || "A")} v {firstName(playerNames[b] || "B")}
                <span className={styles.sideGameStake}> ({g.is_net ? "Net" : "Raw"})</span>
              </span>
              <span className={styles.sideGameThru}>
                Nassau
                {g.value ? <span className={styles.sideGameStake}> {money(g.value)}/bet</span> : null}
              </span>
              {!readOnly && <GearButton onClick={() => setEditing(g)} />}
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
                {!readOnly && <GearButton onClick={() => setEditing(g)} />}
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
                <GameRulesInfoButton gameType={g.game_type} />
                6-6-6
                <span className={styles.sideGameStake}> ({g.is_net ? "Net" : "Raw"})</span>
              </span>
              <span className={styles.sideGameThru}>
                {g.value ? <span className={styles.sideGameStake}>{money(g.value)}/seg</span> : null}
              </span>
              {!readOnly && <GearButton onClick={() => setEditing(g)} />}
            </div>
            <div className={styles.sixesRows}>
              {r.segments.map((s) => {
                // A match decided on the final hole is "1 up", not "1&0"; the "X&Y"
                // notation only applies when there are still holes left (Y >= 1).
                const status = !s.leader ? "AS" : s.closeout && s.remaining > 0 ? `${s.up}&${s.remaining}` : `${s.up} up`;
                const aWin = s.leader === "A";
                const bWin = s.leader === "B";
                return (
                  <div key={s.key} className={styles.sixesRow}>
                    <div className={styles.sixesRowTop}>
                      <span className={styles.sixesLabel}>{s.label}</span>
                      <span className={styles.sixesStatus}>
                        <span className={s.leader ? styles.sixesResult : styles.sixesResultSquare}>{status}</span>
                        {s.dormie && <span className={styles.sideGameDormie}>dormie</span>}
                        {s.decided && s.leader && <span className={styles.sideGameFinal}>final</span>}
                      </span>
                    </div>
                    <div className={styles.sixesMatch}>
                      <span className={aWin ? styles.sixesTeamWin : undefined}>{teamLabel(s.teamA)}</span>
                      <span className={styles.sixesVs}> v </span>
                      <span className={bWin ? styles.sixesTeamWin : undefined}>{teamLabel(s.teamB)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {units && <DebtBoxes netById={Object.fromEntries(players.map((id) => [id, (units[id] ?? 0) * (g.value ?? 0)]))} playerNames={playerNames} />}
          </div>
        );
      })}

      {vegas.map((g) => {
        const scores = g.is_net ? netScores() : gross;
        const players = g.participant_ids;
        if (players.length !== 4) {
          return (
            <div key={g.id} className={styles.sideGame}>
              <div className={styles.sideGameHead}>
                <span className={styles.sideGameTitle}>Vegas</span>
                <span className={styles.sideGameThru} />
                {!readOnly && <GearButton onClick={() => setEditing(g)} />}
              </div>
              <div className={styles.sideGameRows}>
                <span className={styles.sideGameName}>Needs four players.</span>
              </div>
            </div>
          );
        }
        const teamLabel = (t: string[]) => `${firstName(playerNames[t[0]] || "")}+${firstName(playerNames[t[1]] || "")}`;
        const r = computeVegas(holeNumbers, scores, parByHole, players);
        const aWin = r.leader === "A";
        const bWin = r.leader === "B";
        const netById = g.value ? vegasNet(r, g.value) : null;
        return (
          <div key={g.id} className={styles.sideGame}>
            <div className={styles.sideGameHead}>
              <span className={styles.sideGameTitle}>
                <GameRulesInfoButton gameType={g.game_type} />
                Vegas
                <span className={styles.sideGameStake}> ({g.is_net ? "Net" : "Raw"})</span>
              </span>
              <span className={styles.sideGameThru}>
                {g.value ? <span className={styles.sideGameStake}>{money(g.value)}/pt</span> : null}
              </span>
              {!readOnly && <GearButton onClick={() => setEditing(g)} />}
            </div>
            <div className={styles.sixesMatch}>
              <span className={aWin ? styles.sixesTeamWin : undefined}>
                {teamLabel(r.teamA)} {r.aTotal}
              </span>
              <span className={styles.sixesVs}> v </span>
              <span className={bWin ? styles.sixesTeamWin : undefined}>
                {teamLabel(r.teamB)} {r.bTotal}
              </span>
            </div>
            {r.perHole.length > 0 && (
              <div className={styles.vegasHoles}>
                {r.perHole.map((ph) => (
                  <button
                    key={ph.hole}
                    type="button"
                    className={styles.vegasHole}
                    onClick={(e) => setVegasPop({ ph, teamA: r.teamA, teamB: r.teamB, x: e.clientX, y: e.clientY })}
                  >
                    <span className={styles.vegasHoleNum}>{ph.hole}</span>
                    <span className={styles.vegasHoleDiff} data-team={ph.leader ? ph.leader.toLowerCase() : undefined}>
                      {ph.leader ? ph.diff : "–"}
                    </span>
                  </button>
                ))}
                <div className={`${styles.vegasHole} ${styles.vegasTotal}`}>
                  <span className={styles.vegasHoleNum}>T</span>
                  <span className={styles.vegasHoleDiff} data-team={r.leader ? r.leader.toLowerCase() : undefined}>
                    {r.leader ? r.points : "–"}
                  </span>
                </div>
              </div>
            )}
            {netById && <DebtBoxes netById={netById} playerNames={playerNames} />}
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
            onGameSaved?.(g);
            setEditing(null);
          }}
          onRemoved={(id) => {
            onGameRemoved?.(id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {vegasPop &&
        createPortal(
          <div className={styles.vegasPopBackdrop} onClick={() => setVegasPop(null)}>
            {(() => {
              const { ph, teamA, teamB, x, y } = vegasPop;
              const line = (ids: string[], scoresPair: [number, number], num: number, flip: boolean) => (
                <div className={styles.vegasPopLine}>
                  <span>
                    {firstName(playerNames[ids[0]] || "")} {scoresPair[0]}, {firstName(playerNames[ids[1]] || "")} {scoresPair[1]}
                  </span>
                  <span className={styles.vegasPopNum}>
                    → {num}
                    {flip && <span className={styles.vegasPopFlip}> flip</span>}
                  </span>
                </div>
              );
              const winTeam = ph.leader === "A" ? teamA : ph.leader === "B" ? teamB : null;
              const winLabel = winTeam ? `${firstName(playerNames[winTeam[0]] || "")}+${firstName(playerNames[winTeam[1]] || "")}` : null;
              const clampedX = Math.min(Math.max(x, 96), (typeof window !== "undefined" ? window.innerWidth : 400) - 96);
              return (
                <div
                  className={styles.vegasPop}
                  style={{ left: clampedX, top: Math.max(8, y - 12) }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={styles.vegasPopHole}>Hole {ph.hole}</div>
                  {line(teamA, ph.aScores, ph.aNum, ph.aFlip)}
                  {line(teamB, ph.bScores, ph.bNum, ph.bFlip)}
                  <div className={styles.vegasPopResult}>
                    {winLabel ? `${ph.diff} pt${ph.diff === 1 ? "" : "s"} to ${winLabel}` : "Tied — 0 pts"}
                  </div>
                </div>
              );
            })()}
          </div>,
          document.body,
        )}
    </div>
  );
}
