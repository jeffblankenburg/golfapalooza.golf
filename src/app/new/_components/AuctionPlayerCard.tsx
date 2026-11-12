"use client";

import type { AuctionParticipant } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const CELL_GAP = 6;
const CARD_PAD = 10;

/** Every size on the card derives from its width + cells-per-row. When the board gives a
 *  `fill` height (the cell area it wants filled, split into `rows`), logos/names grow to fill
 *  it — bounded by width so they stay proportional — so a tall card means big logos, not an
 *  empty box. Without `fill` (the scrollable admin recorder) height follows the content. */
export function auctionCardMetrics(cardW: number, perRow: number, fill?: { cellAreaH: number; rows: number }) {
  const cellW = Math.max(26, (cardW - CARD_PAD * 2 - CELL_GAP * (perRow - 1)) / perRow);
  const pricePx = clamp(cardW * 0.05, 9, 20);
  const headerPx = clamp(cardW * 0.06, 11, 22);
  if (fill && fill.cellAreaH > 0) {
    const rows = Math.max(1, fill.rows);
    const cellH = Math.max(30, (fill.cellAreaH - CELL_GAP * (rows - 1)) / rows);
    // Logo + name must fit the cell height together, or the name clips: reserve ~26% for the
    // name line (+gap/pad) and let the logo take the rest, also bounded by width.
    const namePx = clamp(Math.min(cellW * 0.2, cellH * 0.19), 8, 22);
    const logo = Math.round(clamp(Math.min(cellW * 0.82, cellH - namePx * 1.3 - 8), 16, 240));
    return { cellW, logo, namePx, pricePx, headerPx, cellH };
  }
  const logo = Math.round(clamp(cellW * 0.66, 16, 132));
  const namePx = clamp(cellW * 0.2, 8, 20);
  const cellH = Math.round(logo + namePx * 1.3 + 8);
  return { cellW, logo, namePx, pricePx, headerPx, cellH };
}

/** Logo size the board would render for a card of this size (one row of cells). The fit
 *  search maximizes this — it picks the column count that makes the logos biggest. */
export function estimateLogoSize(cardW: number, cardH: number, rowCap: number): number {
  if (cardW <= 0 || cardH <= 0) return 0;
  const headerPx = clamp(cardW * 0.06, 11, 22);
  const cellAreaH = cardH - CARD_PAD * 2 - (headerPx * 1.3 + 6) - 8;
  if (cellAreaH <= 0) return 0;
  return auctionCardMetrics(cardW, rowCap, { cellAreaH, rows: 1 }).logo;
}

/** A reasonable card width for the (scrollable) admin recorder, by field size. The board
 *  doesn't use this — it measures its own area and fits cards precisely. */
export function auctionAdminCardWidth(count: number): number {
  if (count <= 8) return 300;
  if (count <= 16) return 250;
  return 220;
}

/** A price/"free" badge pinned just outside a top corner of a team cell, default ink color.
 *  Board puts it top-right; the admin puts it top-left (the red ✕ owns the top-right there). */
function CornerTag({ pos, font, children }: { pos: "tl" | "tr"; font: number; children: React.ReactNode }) {
  return (
    <span style={{ position: "absolute", top: -8, [pos === "tl" ? "left" : "right"]: -4, fontSize: `${font.toFixed(2)}px`, fontWeight: 800, color: "var(--ink)", background: "var(--card)", borderRadius: 5, padding: "0 4px", lineHeight: 1.35, boxShadow: "0 0 0 1px var(--line)", whiteSpace: "nowrap", zIndex: 1 }}>{children}</span>
  );
}

/**
 * One participant card, shared by the projector board and the live admin recorder so the two
 * always match. Name + balance (or points) on top, then a SINGLE ROW of team cells:
 * `teamsPerPlayer` solid-bordered slots (empty ones dashed) filled by real buys, then any
 * bonus/free teams as dashed-brand cells after. Cells share the row equally and shrink as the
 * count grows, so one card holds 3, 4, 5, or 6 teams at a predictable height. Every size
 * scales from `width`, which the board sets so the whole field fits on screen.
 */
/** The "+N" free-rider badge pinned to a card's bottom-right corner. Static on the projector
 *  board; a button (opens the free-teams modal) when `onClick` is supplied (member view). */
function FreeBadge({ count, cardW, onClick }: { count: number; cardW: number; onClick?: () => void }) {
  const sz = Math.round(clamp(cardW * 0.1, 26, 54));
  const off = Math.round(sz * 0.4); // hang off the bottom-right corner rather than cover the card
  const style: React.CSSProperties = {
    position: "absolute", right: -off, bottom: -off, minWidth: sz, height: sz, padding: "0 9px", borderRadius: 999,
    background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 800, fontSize: `${Math.round(sz * 0.42)}px`, lineHeight: 1, boxShadow: "0 3px 9px rgba(0,0,0,0.28)", zIndex: 4,
  };
  const label = `+${count} free team${count === 1 ? "" : "s"}`;
  return onClick
    ? <button type="button" onClick={onClick} aria-label={label} title={label} style={{ ...style, border: "2px solid var(--card)", cursor: "pointer" }}>+{count}</button>
    : <div aria-label={label} title={label} style={style}>+{count}</div>;
}

export default function AuctionPlayerCard({
  p, teamsPerPlayer, width = 240, height, rowCap, highlight = false, rank = null, champ = false, showPoints = false, onUndo, onShowFree, busy = false,
}: {
  p: AuctionParticipant; teamsPerPlayer: number; width?: number; height?: number; rowCap?: number; highlight?: boolean; rank?: number | null;
  champ?: boolean; showPoints?: boolean; onUndo?: (entityId: string) => void; onShowFree?: () => void; busy?: boolean;
}) {
  const bonus = p.teams.flatMap((t) => (t.free ? [t.free] : []));
  const reqCount = Math.max(teamsPerPlayer, p.teams.length); // hold extra real buys (4/5/6) too
  // Only OFFICIAL picks (paid slots + numbered empties) fill the body; free riders collapse into
  // a "+N" badge. Cells sit `perRow` per row and wrap; on the board the card FILLS a fixed slot
  // (`height`) so logos grow as large as it allows. Admin recorder passes no height → content-sized.
  const perRow = rowCap ?? reqCount;
  const rows = Math.ceil(reqCount / perRow);
  const board = typeof height === "number" && height > 0;
  const headerPx0 = clamp(width * 0.06, 11, 22);
  const cellAreaH = board ? height! - CARD_PAD * 2 - (headerPx0 * 1.3 + 6) - 8 : 0;
  const S = board ? auctionCardMetrics(width, perRow, { cellAreaH, rows }) : auctionCardMetrics(width, perRow);
  const canUndo = !!onUndo && !showPoints;
  const pricePos: "tl" | "tr" = canUndo ? "tl" : "tr"; // admin: top-left (✕ owns top-right); board: top-right
  const xSize = Math.round(clamp(S.cellW * 0.36, 15, 20));

  const cellBase: React.CSSProperties = { position: "relative", height: board ? "100%" : S.cellH, minHeight: 0, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "2px 1px" };
  const label = (color?: string): React.CSSProperties => ({ fontSize: `${S.namePx.toFixed(2)}px`, fontWeight: 700, color, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.1 });

  return (
    <div style={{ position: "relative", border: `2px solid ${highlight ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: CARD_PAD, background: "var(--card)", ...(board ? { height: "100%", display: "flex", flexDirection: "column", boxSizing: "border-box" } : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 5, flex: "none" }}>
        <strong style={{ fontSize: `${S.headerPx.toFixed(2)}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rank ? `${rank}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
        <span style={{ fontSize: `${S.headerPx.toFixed(2)}px`, fontWeight: 900, color: "var(--brand)", flexShrink: 0 }}>{showPoints ? `${p.points} pts` : money(p.remainingCents)}</span>
      </div>

      {/* Cells: `perRow` per row, wrapping to more rows for a loaded card. On the board the grid
          FILLS the card height (rows share it equally) so logos grow as large as the slot allows. */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${perRow}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: CELL_GAP, marginTop: 6, ...(board ? { flex: "1 1 0", minHeight: 0 } : { gridAutoRows: `${S.cellH}px` }) }}>
        {Array.from({ length: reqCount }).map((_, i) => {
          const t = p.teams[i];
          return t ? (
            <div key={`t${i}`} style={{ ...cellBase, border: "1px solid var(--line)", background: "var(--bg, #f6f7f5)" }}>
              {canUndo && (
                <button type="button" aria-label="Undo" title="Undo (releases any free team too)" disabled={busy} onClick={() => onUndo!(t.entityId)}
                  style={{ position: "absolute", top: -xSize / 2.4, right: -xSize / 2.4, width: xSize, height: xSize, borderRadius: 999, background: "#dc2626", color: "#fff", border: "2px solid var(--card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: `${xSize * 0.46}px`, lineHeight: 1, cursor: "pointer", padding: 0, zIndex: 2 }}>✕</button>
              )}
              {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: S.logo, height: S.logo, objectFit: "contain" }} /> : <div style={{ width: S.logo, height: S.logo }} />}
              <span style={label()}>({t.seed}) {t.short_name || t.name}</span>
              <CornerTag pos={pricePos} font={S.pricePx}>{money(t.bidCents)}</CornerTag>
            </div>
          ) : (
            // Empty official slot: a large, dim slot number (1-4) faded into the card, not a dash.
            <div key={`e${i}`} style={{ ...cellBase, border: "1px dashed var(--line)" }}>
              <span style={{ fontSize: `${Math.round((board ? S.logo : S.cellH * 0.7) * 1.05)}px`, fontWeight: 800, lineHeight: 1, color: "var(--ink)", opacity: 0.13, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            </div>
          );
        })}
      </div>
      {bonus.length > 0 && <FreeBadge count={bonus.length} cardW={width} onClick={onShowFree} />}
    </div>
  );
}
