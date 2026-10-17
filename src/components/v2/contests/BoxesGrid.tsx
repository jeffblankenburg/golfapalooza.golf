"use client";

import { Fragment } from "react";
import styles from "./BoxesGrid.module.css";
import { type BoxesGridState, type Cell, cellKey } from "@/lib/v2/contests/boxes";
/* eslint-disable @next/next/no-img-element */

export interface AxisTeam {
  label: string; // full team name
  sub?: string; // "home" / "away"
  color?: string | null; // team color (hex) — fills the axis bar
  logo?: string | null; // small team logo shown on the bar
}

function initials(owner: string): string {
  const parts = owner.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return owner.slice(0, 2).toUpperCase();
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

const TEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * The 10×10 Boxes grid (#230). Digit headers across the top (columns) and down
 * the left (rows), team-colored axis bars naming each team (home across the top,
 * away down the left), owner initials in each cell, and two highlight states:
 *   - `currentWinner` — the square winning on the LIVE score (a moving green ring),
 *   - `periodWinners` — squares that LOCKED a period (green fill + winnings badge).
 * Pure presentation; all winner math comes from `boxes.ts`.
 */
export default function BoxesGrid({
  grid,
  teamRow,
  teamCol,
  currentWinner,
  periodWinners = [],
  mine,
  avatars,
  bare = false,
  onCellClick,
}: {
  grid: BoxesGridState;
  teamRow?: AxisTeam;
  teamCol?: AxisTeam;
  currentWinner?: Cell | null;
  periodWinners?: { cell: Cell; label: string; amountCents?: number }[];
  mine?: Set<string>; // cellKeys owned by the viewer — highlighted distinctly
  avatars?: Record<string, string | null>; // cellKey → owner avatar url
  bare?: boolean; // team-agnostic board (drafting): no axes/digits, bigger cells
  onCellClick?: (row: number, col: number) => void;
}) {
  // Aggregate winners per cell: a square can take more than one period, so sum
  // its winnings and collect the period labels (for the tooltip).
  const won = new Map<string, { labels: string[]; amount: number }>();
  for (const pw of periodWinners) {
    const k = cellKey(pw.cell.row, pw.cell.col);
    const e = won.get(k) ?? { labels: [], amount: 0 };
    e.labels.push(pw.label);
    e.amount += pw.amountCents ?? 0;
    won.set(k, e);
  }
  const curKey = currentWinner ? cellKey(currentWinner.row, currentWinner.col) : null;
  const drawn = grid.rowDigits.length === 10 && grid.colDigits.length === 10;

  const renderCell = (r: number, c: number) => {
    const k = cellKey(r, c);
    const owner = grid.owners[k];
    const w = won.get(k);
    const avatar = avatars?.[k] ?? null;
    const badge = w ? (w.amount > 0 ? money(w.amount) : w.labels.join(" ")) : null;
    return (
      <button
        key={k}
        type="button"
        className={styles.cell}
        data-cur={curKey === k || undefined}
        data-won={w ? true : undefined}
        data-mine={mine?.has(k) || undefined}
        data-empty={!owner || undefined}
        onClick={onCellClick ? () => onCellClick(r, c) : undefined}
        disabled={!onCellClick}
        title={w ? `${owner ?? "open"} — won ${w.labels.join(", ")}` : owner ?? "open"}
      >
        {owner && (avatar ? <img className={styles.avatar} src={avatar} alt={owner} /> : <span className={styles.owner}>{initials(owner)}</span>)}
        {badge && <span className={styles.badge}>{badge}</span>}
      </button>
    );
  };

  // Drafting: a team-agnostic board — no axes, no digits, bigger cells.
  if (bare) {
    return (
      <div className={styles.grid} data-bare>
        {TEN.map((r) => (
          <Fragment key={`r${r}`}>{TEN.map((c) => renderCell(r, c))}</Fragment>
        ))}
      </div>
    );
  }

  const axisBg = (t?: AxisTeam) => (t?.color ? { background: t.color } : undefined);

  return (
    <div className={styles.frame}>
      <div className={styles.corner2} />
      <div className={styles.topBar} style={axisBg(teamCol)}>
        {teamCol?.logo && <img className={styles.axisLogo} src={teamCol.logo} alt="" />}
        <span className={styles.axisName}>{teamCol?.label ?? "Home"}</span>
        {teamCol?.sub && <span className={styles.axisSub}>({teamCol.sub})</span>}
      </div>
      <div className={styles.leftBar} style={axisBg(teamRow)}>
        <span className={styles.leftBarInner}>
          {teamRow?.logo && <img className={styles.axisLogo} src={teamRow.logo} alt="" />}
          <span className={styles.axisName}>{teamRow?.label ?? "Away"}</span>
          {teamRow?.sub && <span className={styles.axisSub}>({teamRow.sub})</span>}
        </span>
      </div>
      <div className={styles.grid}>
        <div className={styles.corner} />
        {TEN.map((c) => (
          <div key={`ch${c}`} className={styles.head}>{drawn ? grid.colDigits[c] : "·"}</div>
        ))}
        {TEN.map((r) => (
          <Fragment key={`r${r}`}>
            <div className={styles.head}>{drawn ? grid.rowDigits[r] : "·"}</div>
            {TEN.map((c) => renderCell(r, c))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
