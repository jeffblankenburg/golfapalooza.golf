"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import type { AuctionState } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/**
 * Read-only auction board, live via realtime. Two looks: `projector` (big-screen display
 * at the table — the lot on the block huge, buyer columns across the screen) and the member
 * view (same data, phone width, the viewer's own column highlighted). Picks, the lot on the
 * block, and grading all push automatically.
 */
export default function AuctionBoard({
  state, viewerId, projector = false,
}: {
  state: AuctionState; viewerId: string | null; projector?: boolean;
}) {
  const router = useRouter();
  useEffect(() => subscribeToAuction(state.contest.id, state.config.tournamentId, () => router.refresh()), [state.contest.id, state.config.tournamentId, router]);

  const { participants, onBlock, currentId, onDeckId, results, config } = state;
  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const complete = config.complete;

  // Standings order when complete (by points, then fewest spent); draft order while live.
  const ordered = complete
    ? [...participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents)
    : participants;

  const titleSize = projector ? "2rem" : "1.3rem";
  const colMin = projector ? 230 : 150;

  return (
    <div style={{ padding: projector ? 24 : 0, maxWidth: projector ? "none" : 400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: titleSize, fontWeight: 800, margin: 0 }}>{state.contest.name || "Auction"}</h1>
        <span style={{ fontSize: projector ? "1rem" : "0.8rem", color: "var(--ink-soft)", fontWeight: 700 }}>
          {complete ? "Final" : onBlock ? "Live" : "Draft"}{state.tournament ? `, ${state.tournament.name}` : ""}
        </span>
      </div>

      {/* Champion / runner-up owners */}
      {(results.championOwnerId || results.runnerUpOwnerId) && (
        <p style={{ margin: "8px 0 0", fontSize: projector ? "1.1rem" : "0.9rem" }}>
          {results.championName && <span><strong style={{ color: "var(--brand)" }}>Champion: {results.championName}</strong>{results.championOwnerId ? ` (${nameOf(results.championOwnerId)})` : ""}</span>}
          {results.runnerUpName && <span style={{ color: "var(--ink-soft)" }}>{"  "}Runner-up: {results.runnerUpName}{results.runnerUpOwnerId ? ` (${nameOf(results.runnerUpOwnerId)})` : ""}</span>}
        </p>
      )}

      {!state.tournament && (
        <p style={{ marginTop: 14, color: "var(--ink-soft)", fontSize: projector ? "1.1rem" : "0.9rem" }}>This auction isn&apos;t set up yet. Check back soon.</p>
      )}

      {/* On the block */}
      {!complete && onBlock && (
        <div style={{ marginTop: 14, border: "2px solid var(--brand)", borderRadius: 14, padding: projector ? 24 : 14, textAlign: "center", background: "var(--card)" }}>
          <p style={{ fontSize: projector ? "0.9rem" : "0.68rem", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800, color: "var(--brand)", margin: 0 }}>On the block</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 8 }}>
            {onBlock.logo_url && <img src={onBlock.logo_url} alt="" width={projector ? 56 : 32} height={projector ? 56 : 32} style={{ objectFit: "contain" }} />}
            <span style={{ fontSize: projector ? "2.6rem" : "1.4rem", fontWeight: 800 }}>({onBlock.seed}) {onBlock.name}</span>
          </div>
          {onBlock.bundledThrowIn && <p style={{ fontSize: projector ? "1rem" : "0.8rem", color: "var(--ink-soft)", margin: "6px 0 0" }}>+ ({onBlock.bundledThrowIn.seed}) {onBlock.bundledThrowIn.name} free</p>}
        </div>
      )}

      {/* Up now / on deck */}
      {!complete && currentId && (
        <p style={{ marginTop: 12, fontSize: projector ? "1.2rem" : "0.9rem", textAlign: projector ? "center" : "left" }}>
          <span style={{ color: "var(--ink-soft)", fontWeight: 700 }}>Nominating </span><strong style={{ color: "var(--brand)" }}>{nameOf(currentId)}</strong>
          {onDeckId && <span style={{ color: "var(--ink-soft)" }}>, on deck {nameOf(onDeckId)}</span>}
        </p>
      )}

      {/* Buyer columns / standings */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}px, 1fr))`, gap: 10, marginTop: 16 }}>
        {ordered.map((p, i) => {
          const isViewer = p.userId === viewerId;
          const champ = p.userId === results.championOwnerId;
          return (
            <div key={p.userId} style={{ border: `1px solid ${isViewer ? "var(--brand)" : "var(--line)"}`, borderWidth: isViewer ? 2 : 1, borderRadius: 10, padding: 10, background: "var(--card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontSize: projector ? "1rem" : "0.88rem" }}>{complete ? `${i + 1}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
                <span style={{ fontWeight: 800, color: "var(--brand)", fontSize: projector ? "1rem" : "0.88rem" }}>{complete ? `${p.points} pts` : money(p.remainingCents)}</span>
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)", marginBottom: 6 }}>
                {complete ? `${money(p.spentCents)} spent` : `${p.paidTeams}/${config.teamsPerPlayer} lots${p.done ? ", done" : ""}`}
              </div>
              {p.teams.length === 0 ? <p style={{ fontSize: "0.75rem", color: "var(--ink-soft)", margin: 0 }}>—</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {p.teams.map((t) => (
                    <div key={t.entityId} style={{ fontSize: projector ? "0.82rem" : "0.76rem", display: "flex", justifyContent: "space-between", gap: 6 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.name}{t.freeName ? ` (+${t.freeName})` : ""}</span>
                      <span style={{ color: "var(--ink-soft)" }}>{money(t.bidCents)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
