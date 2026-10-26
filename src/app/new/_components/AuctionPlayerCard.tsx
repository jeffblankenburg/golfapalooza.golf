"use client";

import type { AuctionParticipant } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const CELL_GAP = 6;
const CARD_PAD = 10;

/** Every size on the card derives from its width + how many cells sit in its single row, so
 *  cells shrink as a player holds more teams and the board can scale whole cards to fit. */
export function auctionCardMetrics(cardW: number, cellCount: number) {
  const cellW = Math.max(26, (cardW - CARD_PAD * 2 - CELL_GAP * (cellCount - 1)) / cellCount);
  const logo = Math.round(clamp(cellW * 0.5, 14, 46));
  const namePx = clamp(cellW * 0.17, 7.5, 12.5);
  const pricePx = clamp(cardW * 0.05, 9, 15);
  const headerPx = clamp(cardW * 0.06, 11, 19);
  const cellH = Math.round(logo + namePx * 1.3 + 12);
  return { cellW, logo, namePx, pricePx, headerPx, cellH };
}

/** Predict a card's rendered height for the board's fit math. The tallest card is the base
 *  one (`teamsPerPlayer` cells, biggest cells); bonus teams add cells, shrinking them. */
export function estimateAuctionCardHeight(cardW: number, teamsPerPlayer: number) {
  const S = auctionCardMetrics(cardW, teamsPerPlayer);
  const headerH = S.headerPx * 1.3 + 7;
  return Math.ceil(CARD_PAD * 2 + headerH + 8 + S.cellH + 10); // padding + header + gap + 1 cell row + badge room
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
export default function AuctionPlayerCard({
  p, teamsPerPlayer, width = 240, highlight = false, rank = null, champ = false, showPoints = false, onUndo, busy = false,
}: {
  p: AuctionParticipant; teamsPerPlayer: number; width?: number; highlight?: boolean; rank?: number | null;
  champ?: boolean; showPoints?: boolean; onUndo?: (entityId: string) => void; busy?: boolean;
}) {
  const bonus = p.teams.flatMap((t) => (t.free ? [t.free] : []));
  const reqCount = Math.max(teamsPerPlayer, p.teams.length); // hold extra real buys (4/5/6) too
  const cellCount = reqCount + bonus.length;
  const S = auctionCardMetrics(width, cellCount);
  const canUndo = !!onUndo && !showPoints;
  const pricePos: "tl" | "tr" = canUndo ? "tl" : "tr"; // admin: top-left (✕ owns top-right); board: top-right
  const xSize = Math.round(clamp(S.cellW * 0.36, 15, 20));

  const cellBase: React.CSSProperties = { position: "relative", height: S.cellH, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, padding: "3px 1px" };
  const label = (color?: string): React.CSSProperties => ({ fontSize: `${S.namePx.toFixed(2)}px`, fontWeight: 700, color, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.1 });

  return (
    <div style={{ border: `2px solid ${highlight ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: CARD_PAD, background: "var(--card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <strong style={{ fontSize: `${S.headerPx.toFixed(2)}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rank ? `${rank}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
        <span style={{ fontSize: `${S.headerPx.toFixed(2)}px`, fontWeight: 900, color: "var(--brand)", flexShrink: 0 }}>{showPoints ? `${p.points} pts` : money(p.remainingCents)}</span>
      </div>

      {/* One row, every cell equal width — shrinks to hold 3-6 teams at a steady height */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cellCount}, 1fr)`, gap: CELL_GAP, marginTop: 8 }}>
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
            <div key={`e${i}`} style={{ ...cellBase, border: "1px dashed var(--line)", color: "var(--ink-soft)", opacity: 0.45 }}>—</div>
          );
        })}
        {bonus.map((b, i) => (
          <div key={`b${i}`} style={{ ...cellBase, border: "1.5px dashed var(--brand)", background: "var(--card)" }}>
            {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: S.logo, height: S.logo, objectFit: "contain" }} /> : <div style={{ width: S.logo, height: S.logo }} />}
            <span style={label("var(--brand)")}>({b.seed}) {b.short_name || b.name}</span>
            <CornerTag pos={pricePos} font={S.pricePx}>free</CornerTag>
          </div>
        ))}
      </div>
    </div>
  );
}
