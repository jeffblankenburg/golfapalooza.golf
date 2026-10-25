"use client";

import type { AuctionParticipant } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/**
 * One participant card, shared by the projector board and the live admin recorder so the two
 * always match. Name + balance (or points) up top, then one bordered slot per required lot
 * filled only by real buys (empties are dashed placeholders), then any free bonus teams
 * flowing after. Slots wrap, so a player holding 4, 5, or 6 teams lays out cleanly on two
 * rows instead of squashing. Pass `onUndo` (admin) to add a per-slot remove button.
 */
export default function AuctionPlayerCard({
  p, teamsPerPlayer, highlight = false, rank = null, champ = false, showPoints = false, onUndo, busy = false,
}: {
  p: AuctionParticipant; teamsPerPlayer: number; highlight?: boolean; rank?: number | null;
  champ?: boolean; showPoints?: boolean; onUndo?: (entityId: string) => void; busy?: boolean;
}) {
  const bonus = p.teams.flatMap((t) => (t.free ? [t.free] : []));
  const slotCount = Math.max(teamsPerPlayer, p.teams.length); // hold extra real buys (4/5/6) too

  return (
    <div style={{ border: `2px solid ${highlight ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: 10, background: "var(--card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <strong style={{ fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rank ? `${rank}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
        <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--brand)", flexShrink: 0 }}>{showPoints ? `${p.points} pts` : money(p.remainingCents)}</span>
      </div>

      {/* Lot slots — wrap, so 3 stay in a row and 4-6 flow onto a second row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(50px, 1fr))", gap: 6 }}>
        {Array.from({ length: slotCount }).map((_, i) => {
          const t = p.teams[i];
          return t ? (
            <div key={i} style={{ position: "relative", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 3px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "var(--bg, #f6f7f5)" }}>
              {onUndo && !showPoints && (
                <button type="button" aria-label="Undo" title="Undo (releases any free team too)" disabled={busy} onClick={() => onUndo(t.entityId)}
                  style={{ position: "absolute", top: 1, right: 2, border: "none", background: "none", color: "var(--ink-soft)", cursor: "pointer", padding: 0, lineHeight: 1, fontSize: "0.72rem" }}>✕</button>
              )}
              {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: 30, height: 30, objectFit: "contain" }} /> : <div style={{ width: 30, height: 30 }} />}
              <span style={{ fontSize: "0.66rem", fontWeight: 700, textAlign: "center", lineHeight: 1.05, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>({t.seed}) {t.name}</span>
              <span style={{ fontSize: "0.64rem", color: "var(--ink-soft)" }}>{money(t.bidCents)}</span>
            </div>
          ) : (
            <div key={i} style={{ border: "1px dashed var(--line)", borderRadius: 8, minHeight: 68, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)", opacity: 0.45 }}>—</div>
          );
        })}
      </div>

      {/* Bonus (free) teams flow after the required slots, visually distinct */}
      {bonus.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
          {bonus.map((b, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1.5px dashed var(--brand)", borderRadius: 999, padding: "2px 7px", fontSize: "0.68rem", color: "var(--brand)", fontWeight: 700 }}>
              {b.logo_url && <img src={b.logo_url} alt="" style={{ width: 14, height: 14, objectFit: "contain" }} />}
              ({b.seed}) {b.name} free
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
