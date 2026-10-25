"use client";

import type { AuctionParticipant } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/** A small overlaid badge pinned to a corner of a team cell (price / "free"). */
function CornerTag({ side, children }: { side: "left" | "right"; children: React.ReactNode }) {
  return (
    <span style={{ position: "absolute", bottom: 2, [side]: 2, fontSize: "0.58rem", fontWeight: 800, color: "var(--ink)", background: "var(--card)", borderRadius: 4, padding: "0 3px", lineHeight: 1.35, boxShadow: "0 0 0 1px var(--line)" }}>{children}</span>
  );
}

/**
 * One participant card, shared by the projector board and the live admin recorder so the two
 * always match. Name + balance (or points) up top, then one cell per lot — abbreviations only,
 * to keep every card small enough to show them all. Real buys are solid-bordered; bonus (free)
 * teams get a dashed brand border and flow after. The whole cell grid auto-fits, so a player
 * holding 4, 5, or 6 teams shrinks the cells and wraps rather than blowing up the card.
 * Pass `onUndo` (admin) to add a red remove button on each real buy.
 */
export default function AuctionPlayerCard({
  p, teamsPerPlayer, highlight = false, rank = null, champ = false, showPoints = false, onUndo, busy = false,
}: {
  p: AuctionParticipant; teamsPerPlayer: number; highlight?: boolean; rank?: number | null;
  champ?: boolean; showPoints?: boolean; onUndo?: (entityId: string) => void; busy?: boolean;
}) {
  const bonus = p.teams.flatMap((t) => (t.free ? [t.free] : []));
  const reqCount = Math.max(teamsPerPlayer, p.teams.length); // hold extra real buys (4/5/6) too
  const canUndo = !!onUndo && !showPoints;

  const cellBase: React.CSSProperties = { position: "relative", borderRadius: 8, minHeight: 56, padding: "5px 2px 3px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, overflow: "hidden" };

  return (
    <div style={{ border: `2px solid ${highlight ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: 10, background: "var(--card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <strong style={{ fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rank ? `${rank}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
        <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--brand)", flexShrink: 0 }}>{showPoints ? `${p.points} pts` : money(p.remainingCents)}</span>
      </div>

      {/* One grid for every cell so they shrink + wrap together (handles up to 6 cleanly) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(46px, 1fr))", gap: 6 }}>
        {Array.from({ length: reqCount }).map((_, i) => {
          const t = p.teams[i];
          return t ? (
            <div key={`t${i}`} style={{ ...cellBase, border: "1px solid var(--line)", background: "var(--bg, #f6f7f5)" }}>
              {canUndo && (
                <button type="button" aria-label="Undo" title="Undo (releases any free team too)" disabled={busy} onClick={() => onUndo!(t.entityId)}
                  style={{ position: "absolute", top: -6, right: -6, width: 17, height: 17, borderRadius: 999, background: "#dc2626", color: "#fff", border: "2px solid var(--card)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.56rem", lineHeight: 1, cursor: "pointer", padding: 0, zIndex: 1 }}>✕</button>
              )}
              {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} /> : <div style={{ width: 26, height: 26 }} />}
              <span style={{ fontSize: "0.64rem", fontWeight: 700, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.short_name || t.name}</span>
              <CornerTag side="left">{money(t.bidCents)}</CornerTag>
            </div>
          ) : (
            <div key={`e${i}`} style={{ ...cellBase, border: "1px dashed var(--line)", color: "var(--ink-soft)", opacity: 0.45 }}>—</div>
          );
        })}
        {bonus.map((b, i) => (
          <div key={`b${i}`} style={{ ...cellBase, border: "1.5px dashed var(--brand)", background: "var(--card)" }}>
            {b.logo_url ? <img src={b.logo_url} alt="" style={{ width: 26, height: 26, objectFit: "contain" }} /> : <div style={{ width: 26, height: 26 }} />}
            <span style={{ fontSize: "0.64rem", fontWeight: 700, color: "var(--brand)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({b.seed}) {b.short_name || b.name}</span>
            <CornerTag side="left">free</CornerTag>
          </div>
        ))}
      </div>
    </div>
  );
}
