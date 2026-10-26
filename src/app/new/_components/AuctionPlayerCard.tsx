"use client";

import type { AuctionParticipant } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Every size on the card derives continuously from its width, so the board can scale cards
 *  up or down to make the whole field fit on one screen. */
export function auctionCardMetrics(w: number) {
  const logo = Math.round(clamp(w * 0.14, 18, 58));
  const namePx = clamp(w * 0.05, 9, 17);
  const pricePx = clamp(w * 0.052, 9, 16);
  const headerPx = clamp(w * 0.062, 11, 20);
  const cellMin = Math.round(clamp(w * 0.27, 40, 100));
  const minH = Math.round(logo + namePx * 2.2 + 16);
  return { logo, cellMin, minH, namePx, pricePx, headerPx };
}

/** Predict a card's rendered height for a given width (must mirror the markup below) so the
 *  board can choose a column count that fits all cards in the available height. */
export function estimateAuctionCardHeight(w: number, teamsPerPlayer: number) {
  const S = auctionCardMetrics(w);
  const innerW = w - 20;                                             // card padding (10 each side)
  const cellsPerRow = Math.max(1, Math.floor((innerW + 10) / (S.cellMin + 10))); // columnGap 10
  const cellRows = Math.max(1, Math.ceil(teamsPerPlayer / cellsPerRow));
  const headerH = S.headerPx * 1.3 + 7;                             // header line + marginBottom
  const gridH = 8 + cellRows * S.minH + (cellRows - 1) * 18;        // marginTop + rows + rowGaps
  return Math.ceil(20 + headerH + gridH);                          // + card padding
}

/** A reasonable card width for the (scrollable) admin recorder, by field size. The board
 *  doesn't use this — it measures its own area and fits cards precisely. */
export function auctionAdminCardWidth(count: number): number {
  if (count <= 8) return 280;
  if (count <= 16) return 230;
  return 200;
}

/** A price/"free" badge pinned just outside a top corner of a team cell, default ink color.
 *  Board puts it top-right; the admin puts it top-left (the red ✕ owns the top-right there). */
function CornerTag({ pos, font, children }: { pos: "tl" | "tr"; font: string; children: React.ReactNode }) {
  return (
    <span style={{ position: "absolute", top: -9, [pos === "tl" ? "left" : "right"]: -3, fontSize: font, fontWeight: 800, color: "var(--ink)", background: "var(--card)", borderRadius: 5, padding: "0 4px", lineHeight: 1.4, boxShadow: "0 0 0 1px var(--line)", whiteSpace: "nowrap", zIndex: 1 }}>{children}</span>
  );
}

/**
 * One participant card, shared by the projector board and the live admin recorder so the two
 * always match. Name + balance (or points) up top, then one cell per lot — abbreviations only.
 * Real buys are solid-bordered; bonus (free) teams get a dashed brand border and flow after.
 * Cells auto-fit, so 4/5/6 teams shrink + wrap. Every size scales from `width`, which the
 * board sets so the whole field fits on screen.
 */
export default function AuctionPlayerCard({
  p, teamsPerPlayer, width = 230, highlight = false, rank = null, champ = false, showPoints = false, onUndo, busy = false,
}: {
  p: AuctionParticipant; teamsPerPlayer: number; width?: number; highlight?: boolean; rank?: number | null;
  champ?: boolean; showPoints?: boolean; onUndo?: (entityId: string) => void; busy?: boolean;
}) {
  const S = auctionCardMetrics(width);
  const bonus = p.teams.flatMap((t) => (t.free ? [t.free] : []));
  const reqCount = Math.max(teamsPerPlayer, p.teams.length); // hold extra real buys (4/5/6) too
  const canUndo = !!onUndo && !showPoints;
  const pricePos: "tl" | "tr" = canUndo ? "tl" : "tr"; // admin: top-left (✕ owns top-right); board: top-right
  const nameFont = `${S.namePx.toFixed(2)}px`, priceFont = `${S.pricePx.toFixed(2)}px`;
  const xSize = Math.round(clamp(width * 0.085, 16, 22));

  const cellBase: React.CSSProperties = { position: "relative", borderRadius: 8, minHeight: S.minH, padding: "6px 3px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 };

  return (
    <div style={{ border: `2px solid ${highlight ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: 10, background: "var(--card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <strong style={{ fontSize: `${S.headerPx.toFixed(2)}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rank ? `${rank}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
        <span style={{ fontSize: `${S.headerPx.toFixed(2)}px`, fontWeight: 900, color: "var(--brand)", flexShrink: 0 }}>{showPoints ? `${p.points} pts` : money(p.remainingCents)}</span>
      </div>

      {/* One grid for every cell so they shrink + wrap together (handles up to 6 cleanly).
          Extra column/row gaps leave room for the badges that extend outside each cell. */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${S.cellMin}px, 1fr))`, columnGap: 10, rowGap: 18, marginTop: 8 }}>
        {Array.from({ length: reqCount }).map((_, i) => {
          const t = p.teams[i];
          return t ? (
            <div key={`t${i}`} style={{ ...cellBase, border: "1px solid var(--line)", background: "var(--bg, #f6f7f5)" }}>
              {canUndo && (
                <button type="button" aria-label="Undo" title="Undo (releases any free team too)" disabled={busy} onClick={() => onUndo!(t.entityId)}
                  style={{ position: "absolute", top: -xSize / 2.4, right: -xSize / 2.4, width: xSize, height: xSize, borderRadius: 999, background: "#dc2626", color: "#fff", border: "2px solid var(--card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: `${xSize * 0.46}px`, lineHeight: 1, cursor: "pointer", padding: 0, zIndex: 2 }}>✕</button>
              )}
              {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: S.logo, height: S.logo, objectFit: "contain" }} /> : <div style={{ width: S.logo, height: S.logo }} />}
              <span style={{ fontSize: nameFont, fontWeight: 700, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.short_name || t.name}</span>
              <CornerTag pos={pricePos} font={priceFont}>{money(t.bidCents)}</CornerTag>
            </div>
          ) : (
            <div key={`e${i}`} style={{ ...cellBase, border: "1px dashed var(--line)", color: "var(--ink-soft)", opacity: 0.45 }}>—</div>
          );
        })}
        {bonus.map((b, i) => (
          <div key={`b${i}`} style={{ ...cellBase, border: "1.5px dashed var(--brand)", background: "var(--card)" }}>
            {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: S.logo, height: S.logo, objectFit: "contain" }} /> : <div style={{ width: S.logo, height: S.logo }} />}
            <span style={{ fontSize: nameFont, fontWeight: 700, color: "var(--brand)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({b.seed}) {b.short_name || b.name}</span>
            <CornerTag pos={pricePos} font={priceFont}>free</CornerTag>
          </div>
        ))}
      </div>
    </div>
  );
}
