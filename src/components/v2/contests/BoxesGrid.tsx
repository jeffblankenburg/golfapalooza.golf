"use client";

import { Fragment } from "react";
import styles from "./BoxesGrid.module.css";
import { type BoxesGridState, type Cell, cellKey } from "@/lib/v2/contests/boxes";

export interface AxisTeam {
  label: string;
  color?: string | null;
}

function initials(owner: string): string {
  const parts = owner.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return owner.slice(0, 2).toUpperCase();
}

const TEN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * The 10×10 Boxes grid (#230). Digit headers across the top (columns) and down
 * the left (rows), owner initials in each cell, and two highlight states:
 *   - `currentWinner` — the square winning on the LIVE score (a moving ring),
 *   - `periodWinners` — squares that have LOCKED a period (filled + period badge).
 * Pure presentation; all winner math comes from `boxes.ts`.
 */
export default function BoxesGrid({
  grid,
  teamRow,
  teamCol,
  currentWinner,
  periodWinners = [],
  mine,
  onCellClick,
}: {
  grid: BoxesGridState;
  teamRow?: AxisTeam;
  teamCol?: AxisTeam;
  currentWinner?: Cell | null;
  periodWinners?: { cell: Cell; label: string }[];
  mine?: Set<string>; // cellKeys owned by the viewer — highlighted distinctly
  onCellClick?: (row: number, col: number) => void;
}) {
  const wonLabels = new Map<string, string>();
  for (const pw of periodWinners) {
    const k = cellKey(pw.cell.row, pw.cell.col);
    wonLabels.set(k, wonLabels.has(k) ? `${wonLabels.get(k)} ${pw.label}` : pw.label);
  }
  const curKey = currentWinner ? cellKey(currentWinner.row, currentWinner.col) : null;
  const drawn = grid.rowDigits.length === 10 && grid.colDigits.length === 10;

  return (
    <div className={styles.wrap}>
      <div className={styles.colTeam} style={teamCol?.color ? { color: teamCol.color } : undefined}>
        {teamCol?.label ?? "Columns"} →
      </div>
      <div className={styles.body}>
        <div className={styles.rowTeam} style={teamRow?.color ? { color: teamRow.color } : undefined}>
          <span>{teamRow?.label ?? "Rows"} →</span>
        </div>
        <div className={styles.grid}>
          <div className={styles.corner} />
          {TEN.map((c) => (
            <div key={`ch${c}`} className={styles.head}>{drawn ? grid.colDigits[c] : "·"}</div>
          ))}
          {TEN.map((r) => (
            <Fragment key={`r${r}`}>
              <div className={styles.head}>{drawn ? grid.rowDigits[r] : "·"}</div>
              {TEN.map((c) => {
                const k = cellKey(r, c);
                const owner = grid.owners[k];
                const won = wonLabels.get(k);
                return (
                  <button
                    key={k}
                    type="button"
                    className={styles.cell}
                    data-cur={curKey === k || undefined}
                    data-won={won ? true : undefined}
                    data-mine={mine?.has(k) || undefined}
                    data-empty={!owner || undefined}
                    onClick={onCellClick ? () => onCellClick(r, c) : undefined}
                    disabled={!onCellClick}
                    title={owner ?? "open"}
                  >
                    {owner && <span className={styles.owner}>{initials(owner)}</span>}
                    {won && <span className={styles.badge}>{won}</span>}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
