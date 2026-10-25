"use client";

import type { AuctionParticipant } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

type Tier = "lg" | "md" | "sm";
const TIER: Record<Tier, { logo: number; name: string; price: string; min: number; minH: number }> = {
  lg: { logo: 50, name: "0.95rem", price: "0.84rem", min: 74, minH: 86 },
  md: { logo: 38, name: "0.8rem", price: "0.76rem", min: 60, minH: 70 },
  sm: { logo: 28, name: "0.66rem", price: "0.68rem", min: 46, minH: 56 },
};

/** Logo/name/seed want to fill the space, so cells run large with a small field and shrink
 *  as the field grows. Also drives the participant-card min width so the grid stays balanced. */
export function auctionCardTier(count: number): { tier: Tier; cardMin: number } {
  if (count <= 8) return { tier: "lg", cardMin: 300 };
  if (count <= 16) return { tier: "md", cardMin: 240 };
  return { tier: "sm", cardMin: 196 };
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
 * Cells auto-fit, so 4/5/6 teams shrink + wrap rather than blowing up the card. The ✕ (admin)
 * and the price badge sit just outside each cell's corners. Size comes from `tier` (the caller
 * scales it to the field size via auctionCardTier).
 */
export default function AuctionPlayerCard({
  p, teamsPerPlayer, tier = "md", highlight = false, rank = null, champ = false, showPoints = false, onUndo, busy = false,
}: {
  p: AuctionParticipant; teamsPerPlayer: number; tier?: Tier; highlight?: boolean; rank?: number | null;
  champ?: boolean; showPoints?: boolean; onUndo?: (entityId: string) => void; busy?: boolean;
}) {
  const T = TIER[tier];
  const bonus = p.teams.flatMap((t) => (t.free ? [t.free] : []));
  const reqCount = Math.max(teamsPerPlayer, p.teams.length); // hold extra real buys (4/5/6) too
  const canUndo = !!onUndo && !showPoints;
  const pricePos: "tl" | "tr" = canUndo ? "tl" : "tr"; // admin: top-left (✕ owns top-right); board: top-right

  const cellBase: React.CSSProperties = { position: "relative", borderRadius: 8, minHeight: T.minH, padding: "6px 3px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 };

  return (
    <div style={{ border: `2px solid ${highlight ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: 10, background: "var(--card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <strong style={{ fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rank ? `${rank}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
        <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--brand)", flexShrink: 0 }}>{showPoints ? `${p.points} pts` : money(p.remainingCents)}</span>
      </div>

      {/* One grid for every cell so they shrink + wrap together (handles up to 6 cleanly).
          Extra column/row gaps leave room for the badges that extend outside each cell. */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${T.min}px, 1fr))`, columnGap: 10, rowGap: 18, marginTop: 8 }}>
        {Array.from({ length: reqCount }).map((_, i) => {
          const t = p.teams[i];
          return t ? (
            <div key={`t${i}`} style={{ ...cellBase, border: "1px solid var(--line)", background: "var(--bg, #f6f7f5)" }}>
              {canUndo && (
                <button type="button" aria-label="Undo" title="Undo (releases any free team too)" disabled={busy} onClick={() => onUndo!(t.entityId)}
                  style={{ position: "absolute", top: -8, right: -8, width: 19, height: 19, borderRadius: 999, background: "#dc2626", color: "#fff", border: "2px solid var(--card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", lineHeight: 1, cursor: "pointer", padding: 0, zIndex: 2 }}>✕</button>
              )}
              {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: T.logo, height: T.logo, objectFit: "contain" }} /> : <div style={{ width: T.logo, height: T.logo }} />}
              <span style={{ fontSize: T.name, fontWeight: 700, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.short_name || t.name}</span>
              <CornerTag pos={pricePos} font={T.price}>{money(t.bidCents)}</CornerTag>
            </div>
          ) : (
            <div key={`e${i}`} style={{ ...cellBase, border: "1px dashed var(--line)", color: "var(--ink-soft)", opacity: 0.45 }}>—</div>
          );
        })}
        {bonus.map((b, i) => (
          <div key={`b${i}`} style={{ ...cellBase, border: "1.5px dashed var(--brand)", background: "var(--card)" }}>
            {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: T.logo, height: T.logo, objectFit: "contain" }} /> : <div style={{ width: T.logo, height: T.logo }} />}
            <span style={{ fontSize: T.name, fontWeight: 700, color: "var(--brand)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({b.seed}) {b.short_name || b.name}</span>
            <CornerTag pos={pricePos} font={T.price}>free</CornerTag>
          </div>
        ))}
      </div>
    </div>
  );
}
