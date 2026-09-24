import styles from "@/app/new/new.module.css";
import { getTeeDotStyle } from "@/lib/utils/tee-colors";

/**
 * Read-only scorecard: the Hole / Yards / HDCP / Par grid (front + back) plus a
 * totals table with per-player tee dot, score (superscript to-par), and any
 * trackable columns (putts / FIR / GIR / penalties) the round has data for.
 * Shared by the in-drawer RoundDetail and the public /watch page — names/labels
 * are pre-resolved by the caller so this stays free of name-mode context.
 */

export interface SCHole {
  hole_number: number;
  par: number;
  handicap_index: number | null;
  yards: number | null;
}
export interface SCStats {
  putts: number | null;
  fairways: { hit: number; of: number } | null;
  gir: { hit: number; of: number } | null;
  penalties: number | null;
}
export interface SCPlayer {
  name: string; // full name (totals)
  shortLabel: string; // short label (grid)
  is_viewer: boolean;
  is_guest: boolean;
  tee_color: string | null;
  gross: number | null;
  to_par: number | null;
  scores: Record<number, number>;
  stats: SCStats;
}

function TeeDot({ color }: { color: string | null }) {
  const { className, style } = getTeeDotStyle(color);
  return <span className={`${styles.teeDot} ${className || ""}`} style={{ marginRight: 6, ...style }} />;
}

function toParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `-${Math.abs(n)}`;
}

/** Golf scorecard mark for a hole score relative to par. */
function mark(strokes: number | null, par: number): string {
  if (strokes == null) return "none";
  const d = strokes - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 0) return "par";
  if (d === 1) return "bogey";
  return "double";
}

function Nine({ holes, players, totalLabel }: { holes: SCHole[]; players: SCPlayer[]; totalLabel: string }) {
  const outPar = holes.reduce((s, h) => s + h.par, 0);
  const anyYards = holes.some((h) => h.yards != null);
  const outYards = holes.reduce((s, h) => s + (h.yards ?? 0), 0);
  return (
    <div className={styles.scNine}>
      {/* Established order: Hole, Yards, HDCP, Par. */}
      <div className={styles.scRow}>
        <span className={styles.scRowLabel}>Hole</span>
        {holes.map((h) => (
          <span key={h.hole_number} className={styles.scHead}>{h.hole_number}</span>
        ))}
        <span className={styles.scHead} data-total>{totalLabel}</span>
      </div>
      {anyYards && (
        <div className={styles.scRow}>
          <span className={styles.scRowLabel}>Yards</span>
          {holes.map((h) => (
            <span key={h.hole_number} className={styles.scHcp}>{h.yards ?? ""}</span>
          ))}
          <span className={styles.scHcp} data-total>{outYards || ""}</span>
        </div>
      )}
      <div className={styles.scRow}>
        <span className={styles.scRowLabel}>HDCP</span>
        {holes.map((h) => (
          <span key={h.hole_number} className={styles.scHcp}>{h.handicap_index ?? ""}</span>
        ))}
        <span className={styles.scHcp} data-total />
      </div>
      <div className={styles.scRow}>
        <span className={styles.scRowLabel}>Par</span>
        {holes.map((h) => (
          <span key={h.hole_number} className={styles.scPar}>{h.par}</span>
        ))}
        <span className={styles.scPar} data-total>{outPar}</span>
      </div>
      {players.map((pl, i) => {
        const played = holes.filter((h) => pl.scores[h.hole_number] != null);
        const outScore = played.length ? played.reduce((s, h) => s + pl.scores[h.hole_number], 0) : null;
        return (
          <div key={i} className={styles.scScoreRow} data-viewer={pl.is_viewer || undefined}>
            <span className={styles.scNameLabel}>{pl.shortLabel}</span>
            {holes.map((h) => {
              const st = pl.scores[h.hole_number] ?? null;
              return (
                <span key={h.hole_number} className={styles.scCell}>
                  <span className={styles.scMark} data-mark={mark(st, h.par)} data-two={st != null && st >= 10 ? "" : undefined}>
                    <span className={styles.scNum}>{st ?? "·"}</span>
                  </span>
                </span>
              );
            })}
            <span className={styles.scCell} data-total>
              <span className={styles.scTotalNum}>{outScore ?? "·"}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function RoundScorecard({
  holes,
  players,
  roundType,
  isScramble,
  teamNames = [],
}: {
  holes: SCHole[];
  players: SCPlayer[];
  roundType: "18" | "9-front" | "9-back";
  isScramble: boolean;
  teamNames?: string[];
}) {
  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number >= 10);

  // Scramble = one team ball; collapse to a single row for grid + totals.
  const gridPlayers: SCPlayer[] =
    isScramble && players[0] ? [{ ...players[0], shortLabel: "Team", is_viewer: false }] : players;
  const totalRows: SCPlayer[] =
    isScramble && players[0] ? [{ ...players[0], name: "Team", is_viewer: false, is_guest: false }] : players;

  const showPutts = totalRows.some((r) => r.stats?.putts != null);
  const showFir = totalRows.some((r) => r.stats?.fairways != null);
  const showGir = totalRows.some((r) => r.stats?.gir != null);
  const showPen = totalRows.some((r) => r.stats?.penalties != null);

  return (
    <>
      {holes.length > 0 ? (
        <div className={styles.scCard}>
          {front.length > 0 && <Nine holes={front} players={gridPlayers} totalLabel={roundType === "18" ? "Out" : "Tot"} />}
          {back.length > 0 && <Nine holes={back} players={gridPlayers} totalLabel={roundType === "18" ? "In" : "Tot"} />}
        </div>
      ) : (
        <p className={styles.scQuickNote}>Quick entry: gross score only, no hole-by-hole card.</p>
      )}

      <div className={styles.scPlayers}>
        <p className={styles.scPlayersLabel}>{isScramble ? "Team score" : "Totals"}</p>
        <div className={styles.scStatTable}>
          <div className={styles.scStatHead}>
            <span className={styles.scStatName} />
            <span className={styles.scStatCol}>Score</span>
            {showPutts && <span className={styles.scStatCol}>Putts</span>}
            {showFir && <span className={styles.scStatCol}>FIR</span>}
            {showGir && <span className={styles.scStatCol}>GIR</span>}
            {showPen && <span className={styles.scStatCol}>Pen</span>}
          </div>
          {totalRows.map((row, i) => (
            <div key={i} className={styles.scStatRow} data-viewer={row.is_viewer || undefined}>
              <span className={styles.scStatName}>
                <TeeDot color={row.tee_color} />
                {row.name}
                {row.is_guest && <span className={styles.scGuestTag}>guest</span>}
              </span>
              <span className={styles.scStatCol}>
                <span style={{ display: "inline-flex", alignItems: "flex-start" }}>
                  <span className={styles.scStatGross}>{row.gross ?? "—"}</span>
                  {row.to_par != null && <span className={styles.scStatPar}>{toParLabel(row.to_par)}</span>}
                </span>
              </span>
              {showPutts && <span className={styles.scStatCol}>{row.stats?.putts ?? "—"}</span>}
              {showFir && (
                <span className={styles.scStatCol}>{row.stats?.fairways ? `${row.stats.fairways.hit}/${row.stats.fairways.of}` : "—"}</span>
              )}
              {showGir && (
                <span className={styles.scStatCol}>{row.stats?.gir ? `${row.stats.gir.hit}/${row.stats.gir.of}` : "—"}</span>
              )}
              {showPen && <span className={styles.scStatCol}>{row.stats?.penalties ?? "—"}</span>}
            </div>
          ))}
        </div>
        {teamNames.length > 0 && <p className={styles.scTeamNames}>{teamNames.join(", ")}</p>}
      </div>
    </>
  );
}
