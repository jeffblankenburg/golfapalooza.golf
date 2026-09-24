import React from "react";
import { TEE_HEX_COLORS } from "@/lib/utils/tee-colors";

/**
 * Group scorecard rendered for next/og `ImageResponse` (#204). Real-scorecard
 * layout: hole numbers, yardage, par, stroke index (Hcp), then a row per player
 * (guests included). Out/In/Total columns for 18-hole rounds, a to-par beside each
 * name, classic notation (circle = under par, square = over; doubled for
 * eagle/double-bogey+), putts as a small in-cell badge, zebra striping, and shaded
 * summary columns. Satori is flexbox-only — no grid.
 */

export interface CardCell {
  strokes: number | null;
  putts: number | null;
}
export interface CardHole {
  hole_number: number;
  par: number;
  yards: number | null;
  handicap_index: number | null;
}
export interface CardPlayer {
  name: string;
  teeColor: string | null; // shown as a dot beside the name (each player's tee)
  total: number | null;
  toPar: number | null;
  cells: CardCell[]; // aligned to holes order
}
export interface ScorecardData {
  orgName: string | null;
  logoUrl: string | null;
  accent: string;
  courseName: string;
  subtitle: string;
  holes: CardHole[];
  parTotal: number;
  players: CardPlayer[];
}

const INK = "#14241b";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const STRIPE = "#f6f8f7";
const SUMMARY_BG = "#eef2f0";

const NAME_W = 224;
const CELL_W = 54;
const SUB_W = 62;
const TOT_W = 88;
const ROW_H = 54; // player rows
const INFO_H = 36; // Hole / Yards / HDCP / Par rows
const INFO_FS = 15; // shared font size for the info rows
const HEADER_H = 132;
const PAD = 40;

function hasBothNines(holes: { hole_number: number }[]): boolean {
  return holes.some((h) => h.hole_number <= 9) && holes.some((h) => h.hole_number >= 10);
}
function hasYards(holes: CardHole[]): boolean {
  return holes.some((h) => h.yards != null);
}

/** Pixel dimensions — used by both the element and ImageResponse. */
export function scorecardSize(holes: CardHole[], playersLen: number): { width: number; height: number } {
  const subCols = hasBothNines(holes) ? 2 : 0;
  const width = PAD * 2 + NAME_W + holes.length * CELL_W + subCols * SUB_W + TOT_W;
  // Info rows: Hole + HDCP + Par always, Yards when present.
  const infoRows = 3 + (hasYards(holes) ? 1 : 0);
  const height = PAD * 2 + HEADER_H + INFO_H * infoRows + ROW_H * playersLen + 16;
  return { width, height };
}

/** Background (+ border for light tees) for a player's tee dot. Handles named
 *  colors, hex, and composition-tee "A/B" gradients. */
function teeDotStyle(color: string | null): React.CSSProperties {
  if (!color) return { display: "none" };
  if (color.includes("/")) {
    const [a, b] = color.split("/").map((c) => c.trim());
    const h1 = TEE_HEX_COLORS[a] || "#9ca3af";
    const h2 = TEE_HEX_COLORS[b] || h1;
    return { background: `linear-gradient(135deg, ${h1} 50%, ${h2} 50%)` };
  }
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : TEE_HEX_COLORS[color] || TEE_HEX_COLORS[color.toLowerCase()];
  if (!hex) return { background: "#9ca3af" };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const bl = parseInt(hex.slice(5, 7), 16);
  const light = (0.299 * r + 0.587 * g + 0.114 * bl) / 255 > 0.75;
  return { background: hex, border: light ? "1px solid #cbd5cb" : "none" };
}

function toParText(toPar: number | null): string {
  if (toPar == null) return "";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `-${Math.abs(toPar)}`;
}

function shapeFor(diff: number): { kind: "none" | "circle" | "square"; double: boolean } {
  if (diff <= -2) return { kind: "circle", double: true };
  if (diff === -1) return { kind: "circle", double: false };
  if (diff === 0) return { kind: "none", double: false };
  if (diff === 1) return { kind: "square", double: false };
  return { kind: "square", double: true };
}

const NUM_STYLE: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: INK,
  lineHeight: 1,
  display: "flex",
  transform: "translateY(0.75px)",
};

function ScoreCell({ cell, par }: { cell: CardCell; par: number }) {
  const base: React.CSSProperties = {
    width: CELL_W,
    height: ROW_H,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderLeft: `1px solid ${LINE}`,
  };
  if (cell.strokes == null) return <div style={base} />;
  const { kind, double } = shapeFor(cell.strokes - par);

  // Score with the putt count as a true superscript, both INSIDE the shape.
  const content = (
    <span style={{ display: "flex", alignItems: "flex-start", lineHeight: 1 }}>
      <span style={NUM_STYLE}>{cell.strokes}</span>
      {cell.putts != null && (
        <span style={{ fontSize: 10, fontWeight: 600, color: MUTED, lineHeight: 1, marginLeft: 1 }}>{cell.putts}</span>
      )}
    </span>
  );

  if (kind === "none") return <div style={base}>{content}</div>;

  const radius = kind === "circle" ? 999 : 6;
  const inner = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, border: `1.5px solid ${INK}`, borderRadius: radius }}>
      {content}
    </div>
  );
  const shape = double ? (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 42, height: 42, border: `1.5px solid ${INK}`, borderRadius: radius }}>
      {inner}
    </div>
  ) : (
    inner
  );

  return <div style={base}>{shape}</div>;
}

/** Generic centered text cell with a left divider (hole numbers, yards, par, hcp,
 *  and the Out/In/Tot summaries when given a summary background). */
function TextCell({ value, w, h, style }: { value: string | number; w: number; h: number; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderLeft: `1px solid ${LINE}`,
        lineHeight: 1,
        ...style,
      }}
    >
      {value}
    </div>
  );
}

function RowLabel({ value, h, style }: { value: string; h: number; style?: React.CSSProperties }) {
  return <div style={{ width: NAME_W, height: h, display: "flex", alignItems: "center", paddingLeft: 6, ...style }}>{value}</div>;
}

function sum(cells: CardCell[]): number | null {
  const played = cells.filter((c) => c.strokes != null);
  if (played.length === 0) return null;
  return played.reduce((s, c) => s + (c.strokes ?? 0), 0);
}

export function ScorecardImage(d: ScorecardData): React.ReactElement {
  const { width, height } = scorecardSize(d.holes, d.players.length);
  const both = hasBothNines(d.holes);
  const showYards = hasYards(d.holes);

  const idx = d.holes.map((h, j) => ({ h, j }));
  const frontIdx = idx.filter((x) => x.h.hole_number <= 9);
  const backIdx = idx.filter((x) => x.h.hole_number >= 10);
  const frontPar = frontIdx.reduce((s, x) => s + x.h.par, 0);
  const backPar = backIdx.reduce((s, x) => s + x.h.par, 0);
  const frontYards = frontIdx.reduce((s, x) => s + (x.h.yards ?? 0), 0);
  const backYards = backIdx.reduce((s, x) => s + (x.h.yards ?? 0), 0);
  const totalYards = frontYards + backYards;

  const summary = (style?: React.CSSProperties): React.CSSProperties => ({ background: SUMMARY_BG, ...style });

  return (
    <div style={{ width, height, display: "flex", flexDirection: "column", background: "#ffffff", padding: PAD, fontFamily: "sans-serif" }}>
      {/* Header: group name + course + subtitle (no logo) */}
      <div style={{ height: HEADER_H, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        {d.orgName && <span style={{ fontSize: 22, fontWeight: 700, color: d.accent, letterSpacing: 1 }}>{d.orgName.toUpperCase()}</span>}
        <span style={{ fontSize: 40, fontWeight: 800, color: INK, marginTop: 2 }}>{d.courseName}</span>
        <span style={{ fontSize: 20, color: MUTED, marginTop: 4 }}>{d.subtitle}</span>
      </div>

      {/* Hole numbers */}
      <div style={{ display: "flex", borderTop: `2px solid ${INK}`, borderBottom: `1px solid ${LINE}` }}>
        <RowLabel value="Hole" h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS, fontWeight: 700 }} />
        {frontIdx.map((x) => (
          <TextCell key={`h${x.h.hole_number}`} value={x.h.hole_number} w={CELL_W} h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS, fontWeight: 700 }} />
        ))}
        {both && <TextCell value="Out" w={SUB_W} h={INFO_H} style={summary({ color: INK, fontSize: INFO_FS, fontWeight: 700 })} />}
        {backIdx.map((x) => (
          <TextCell key={`h${x.h.hole_number}`} value={x.h.hole_number} w={CELL_W} h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS, fontWeight: 700 }} />
        ))}
        {both && <TextCell value="In" w={SUB_W} h={INFO_H} style={summary({ color: INK, fontSize: INFO_FS, fontWeight: 700 })} />}
        <TextCell value="Tot" w={TOT_W} h={INFO_H} style={summary({ color: INK, fontSize: INFO_FS, fontWeight: 700 })} />
      </div>

      {/* Yardage */}
      {showYards && (
        <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
          <RowLabel value="Yards" h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS, fontWeight: 500 }} />
          {frontIdx.map((x) => (
            <TextCell key={`y${x.h.hole_number}`} value={x.h.yards ?? ""} w={CELL_W} h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS }} />
          ))}
          {both && <TextCell value={frontYards || ""} w={SUB_W} h={INFO_H} style={summary({ color: MUTED, fontSize: INFO_FS, fontWeight: 600 })} />}
          {backIdx.map((x) => (
            <TextCell key={`y${x.h.hole_number}`} value={x.h.yards ?? ""} w={CELL_W} h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS }} />
          ))}
          {both && <TextCell value={backYards || ""} w={SUB_W} h={INFO_H} style={summary({ color: MUTED, fontSize: INFO_FS, fontWeight: 600 })} />}
          <TextCell value={totalYards || ""} w={TOT_W} h={INFO_H} style={summary({ color: MUTED, fontSize: INFO_FS, fontWeight: 600 })} />
        </div>
      )}

      {/* Handicap (stroke index) */}
      <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
        <RowLabel value="HDCP" h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS, fontWeight: 500 }} />
        {frontIdx.map((x) => (
          <TextCell key={`i${x.h.hole_number}`} value={x.h.handicap_index ?? ""} w={CELL_W} h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS }} />
        ))}
        {both && <TextCell value="" w={SUB_W} h={INFO_H} style={summary()} />}
        {backIdx.map((x) => (
          <TextCell key={`i${x.h.hole_number}`} value={x.h.handicap_index ?? ""} w={CELL_W} h={INFO_H} style={{ color: MUTED, fontSize: INFO_FS }} />
        ))}
        {both && <TextCell value="" w={SUB_W} h={INFO_H} style={summary()} />}
        <TextCell value="" w={TOT_W} h={INFO_H} style={summary()} />
      </div>

      {/* Par — same size as the info rows, but bold. Heavy bottom border separates
          the reference rows from the golfers. */}
      <div style={{ display: "flex", borderBottom: `2px solid ${INK}` }}>
        <RowLabel value="Par" h={INFO_H} style={{ color: INK, fontSize: INFO_FS, fontWeight: 700 }} />
        {frontIdx.map((x) => (
          <TextCell key={`p${x.h.hole_number}`} value={x.h.par} w={CELL_W} h={INFO_H} style={{ color: INK, fontSize: INFO_FS, fontWeight: 700 }} />
        ))}
        {both && <TextCell value={frontPar} w={SUB_W} h={INFO_H} style={summary({ color: INK, fontSize: INFO_FS, fontWeight: 700 })} />}
        {backIdx.map((x) => (
          <TextCell key={`p${x.h.hole_number}`} value={x.h.par} w={CELL_W} h={INFO_H} style={{ color: INK, fontSize: INFO_FS, fontWeight: 700 }} />
        ))}
        {both && <TextCell value={backPar} w={SUB_W} h={INFO_H} style={summary({ color: INK, fontSize: INFO_FS, fontWeight: 700 })} />}
        <TextCell value={d.parTotal} w={TOT_W} h={INFO_H} style={summary({ color: INK, fontSize: INFO_FS, fontWeight: 700 })} />
      </div>

      {/* Player rows */}
      {d.players.map((p, i) => {
        const frontCells = frontIdx.map((x) => p.cells[x.j] ?? { strokes: null, putts: null });
        const backCells = backIdx.map((x) => p.cells[x.j] ?? { strokes: null, putts: null });
        const outSum = sum(frontCells);
        const inSum = sum(backCells);
        return (
          <div key={i} style={{ display: "flex", borderBottom: `1px solid ${LINE}`, background: i % 2 === 1 ? STRIPE : "#ffffff" }}>
            <div style={{ width: NAME_W, height: ROW_H, display: "flex", alignItems: "center", paddingLeft: 6, overflow: "hidden" }}>
              <div style={{ width: 12, height: 12, borderRadius: 999, marginRight: 8, flexShrink: 0, ...teeDotStyle(p.teeColor) }} />
              <span style={{ color: INK, fontSize: 18, fontWeight: 600 }}>{p.name}</span>
              <span style={{ color: MUTED, fontSize: 15, fontWeight: 700, marginLeft: 8 }}>{toParText(p.toPar)}</span>
            </div>
            {frontCells.map((c, j) => (
              <ScoreCell key={`f${j}`} cell={c} par={frontIdx[j].h.par} />
            ))}
            {both && <TextCell value={outSum ?? ""} w={SUB_W} h={ROW_H} style={summary({ color: INK, fontSize: 18, fontWeight: 600 })} />}
            {backCells.map((c, j) => (
              <ScoreCell key={`b${j}`} cell={c} par={backIdx[j].h.par} />
            ))}
            {both && <TextCell value={inSum ?? ""} w={SUB_W} h={ROW_H} style={summary({ color: INK, fontSize: 18, fontWeight: 600 })} />}
            <TextCell value={p.total ?? ""} w={TOT_W} h={ROW_H} style={summary({ color: INK, fontSize: 22, fontWeight: 800 })} />
          </div>
        );
      })}
    </div>
  );
}
