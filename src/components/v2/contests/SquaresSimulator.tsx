"use client";

import { useState } from "react";
import styles from "./SquaresSimulator.module.css";
import SquaresGrid from "./SquaresGrid";
import {
  type SquaresGridState,
  cellKey,
  computePeriods,
  drawDigits,
  winningCell,
  PERIOD_PRESETS,
} from "@/lib/v2/contests/squares";
import { LEAGUES, getLeague } from "@/lib/v2/sports/espn";

const SAMPLE = [
  "Jeff B", "Amir Q", "Bennett A", "Camila F", "Dave R", "Whitey", "Marcus T", "Priya S",
  "Leo K", "Nina P", "Omar H", "Sara L", "Tom W", "Gus R", "Ravi N", "Mia C",
];
const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

/**
 * Squares Simulator (#232 + #230). Drives the grid with local state only — no DB,
 * no ESPN, no money moved. "Play" a game by bumping the score (watch the winning
 * square move live) and End each period to lock its winner + payout. This is both
 * the admin test harness (verify scoring before real games) and a preview of the
 * live in-game watch experience, running on the exact same pure `squares.ts` math.
 */
export default function SquaresSimulator() {
  const [owners, setOwners] = useState<Record<string, string | null>>({});
  const [rowDigits, setRowDigits] = useState<number[]>([]);
  const [colDigits, setColDigits] = useState<number[]>([]);
  const [teamRow, setTeamRow] = useState("Home");
  const [teamCol, setTeamCol] = useState("Away");
  const [leagueKey, setLeagueKey] = useState("mens-college-basketball");
  const [potStr, setPotStr] = useState("1000");
  const [rowScore, setRowScore] = useState(0);
  const [colScore, setColScore] = useState(0);
  const [finals, setFinals] = useState<Record<string, { rowScore: number; colScore: number }>>({});

  const grid: SquaresGridState = { owners, rowDigits, colDigits };
  const league = getLeague(leagueKey)!;
  const periods = PERIOD_PRESETS[league.periods];
  const potCents = Math.round((parseFloat(potStr) || 0) * 100);
  const drawn = rowDigits.length === 10 && colDigits.length === 10;

  const cur = winningCell(grid, rowScore, colScore);
  const curOwner = cur ? owners[cellKey(cur.row, cur.col)] : null;

  const periodWinners = periods
    .filter((p) => finals[p.key])
    .map((p) => ({ cell: winningCell(grid, finals[p.key].rowScore, finals[p.key].colScore), label: p.label }))
    .filter((x): x is { cell: NonNullable<typeof x.cell>; label: string } => x.cell !== null);

  const scoresForCalc = Object.fromEntries(
    periods.map((p) => {
      const f = finals[p.key];
      return [p.key, f ? { rowScore: f.rowScore, colScore: f.colScore, final: true } : { rowScore, colScore, final: false }];
    }),
  );
  const outcomes = computePeriods(grid, potCents, periods, scoresForCalc);

  function fillOwners() {
    const o: Record<string, string | null> = {};
    let i = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) { o[cellKey(r, c)] = SAMPLE[i % SAMPLE.length]; i++; }
    setOwners(o);
  }
  const toggleOwner = (r: number, c: number) =>
    setOwners((p) => ({ ...p, [cellKey(r, c)]: p[cellKey(r, c)] === "You" ? null : "You" }));
  const draw = () => { setRowDigits(drawDigits()); setColDigits(drawDigits()); };
  const bump = (which: "row" | "col", by: number) =>
    which === "row" ? setRowScore((s) => Math.max(0, s + by)) : setColScore((s) => Math.max(0, s + by));
  const endPeriod = (key: string) => setFinals((p) => ({ ...p, [key]: { rowScore, colScore } }));
  const reopen = (key: string) => setFinals((p) => { const n = { ...p }; delete n[key]; return n; });
  const resetGame = () => { setRowScore(0); setColScore(0); setFinals({}); };

  const quickAdds = league.scoring === "football" ? [1, 3, 7] : [1, 2, 3];

  return (
    <div className={styles.sim}>
      <div className={styles.head}>
        <h2 className={styles.title}>Squares Simulator</h2>
        <p className={styles.sub}>Verify scoring with any scores — no game, no money. Same math the real contest uses.</p>
      </div>

      {/* Setup */}
      <div className={styles.row}>
        <select className={styles.league} value={leagueKey} onChange={(e) => { setLeagueKey(e.target.value); resetGame(); }} aria-label="League">
          {LEAGUES.map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
        <button type="button" className={styles.btn} onClick={draw}>{drawn ? "Redraw digits" : "Draw digits"}</button>
        <button type="button" className={styles.btn} onClick={fillOwners}>Fill owners</button>
        <button type="button" className={styles.btnGhost} onClick={() => setOwners({})}>Clear</button>
        <label className={styles.pot}>Pot $<input value={potStr} inputMode="decimal" onChange={(e) => setPotStr(e.target.value)} /></label>
      </div>
      <div className={styles.row}>
        <label className={styles.lbl}>Rows<input value={teamRow} onChange={(e) => setTeamRow(e.target.value)} /></label>
        <label className={styles.lbl}>Cols<input value={teamCol} onChange={(e) => setTeamCol(e.target.value)} /></label>
        <span className={styles.hint}>{drawn ? "Tap a square to claim it as “You”." : "Draw digits to assign numbers."}</span>
      </div>

      <SquaresGrid
        grid={grid}
        teamRow={{ label: teamRow }}
        teamCol={{ label: teamCol }}
        currentWinner={cur}
        periodWinners={periodWinners}
        onCellClick={toggleOwner}
      />

      {/* Live score */}
      <div className={styles.scoreBoard}>
        {( [["row", teamRow, rowScore], ["col", teamCol, colScore]] as const).map(([which, label, score]) => (
          <div key={which} className={styles.scoreCol}>
            <span className={styles.scoreLabel}>{label}</span>
            <div className={styles.scoreCtrl}>
              <button type="button" onClick={() => bump(which, -1)} disabled={score <= 0}>−</button>
              <span className={styles.scoreNum}>{score}</span>
              <button type="button" onClick={() => bump(which, 1)}>+</button>
            </div>
            <div className={styles.quick}>
              {quickAdds.map((n) => (
                <button key={n} type="button" onClick={() => bump(which, n)}>+{n}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className={styles.live}>
        {!drawn ? "Draw digits to see a winner." : cur
          ? <>Winning now: <strong>{curOwner ?? "open square"}</strong> — last digits {rowScore % 10}×{colScore % 10}</>
          : "No winner yet."}
      </p>

      {/* Periods + payouts */}
      <div className={styles.periods}>
        {outcomes.map((o) => (
          <div key={o.key} className={styles.period} data-final={o.final || undefined}>
            <span className={styles.pLabel}>{o.label} <span className={styles.pWeight}>{o.weightPct}%</span></span>
            <span className={styles.pPay}>{money(o.amountCents)}</span>
            <span className={styles.pWin}>
              {o.cell ? (o.owner ?? "open square") : "—"}
              {o.final ? <span className={styles.pTag}>final {o.rowScore}–{o.colScore}</span> : <span className={styles.pTagLive}>if now</span>}
            </span>
            {o.final
              ? <button type="button" className={styles.pBtnGhost} onClick={() => reopen(o.key)}>reopen</button>
              : <button type="button" className={styles.pBtn} onClick={() => endPeriod(o.key)} disabled={!drawn}>End {o.label}</button>}
          </div>
        ))}
      </div>
      <button type="button" className={styles.reset} onClick={resetGame}>Reset game</button>
    </div>
  );
}
