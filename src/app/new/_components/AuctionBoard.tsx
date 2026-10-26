"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import type { AuctionState } from "@/lib/v2/contests/auction-server";
import styles from "@/app/new/new.module.css";
import AuctionPlayerCard, { estimateAuctionCardHeight } from "./AuctionPlayerCard";

const GRID_GAP = 12;

/** Pick the column count + card width that fits all `n` cards inside a `W`×`H` area, with the
 *  cards as large as possible. Falls back to the least-overflowing layout if nothing fits. */
function fitLayout(W: number, H: number, n: number, teamsPerPlayer: number): { cols: number; cardW: number } {
  if (n <= 0) return { cols: 1, cardW: 240 };
  let best: { cols: number; cardW: number } | null = null;
  let fallback = { cols: n, cardW: 120, overflow: Infinity };
  for (let cols = 1; cols <= n; cols++) {
    const cardW = (W - GRID_GAP * (cols - 1)) / cols;
    if (cardW < 110) break; // narrower than this is unreadable; stop adding columns
    const rows = Math.ceil(n / cols);
    const totalH = rows * estimateAuctionCardHeight(cardW, teamsPerPlayer) + GRID_GAP * (rows - 1);
    if (totalH <= H) { if (!best || cardW > best.cardW) best = { cols, cardW }; }
    else if (totalH - H < fallback.overflow) fallback = { cols, cardW, overflow: totalH - H };
  }
  return best ?? { cols: fallback.cols, cardW: fallback.cardW };
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/**
 * Read-only auction board, live via realtime. Two looks:
 *  - `projector`: a full-screen big-screen display for the table — no app chrome, a left
 *    rail of upcoming nominators (skip-aware), the lot on the block huge, and a grid of
 *    every participant's lots + remaining balance below.
 *  - member: the same data phone-width inside the app shell, the viewer's column highlighted.
 * Picks, the lot on the block, and grading all push automatically.
 */
export default function AuctionBoard({
  state, viewerId, projector = false,
}: {
  state: AuctionState; viewerId: string | null; projector?: boolean;
}) {
  const router = useRouter();
  // Realtime for instant updates, plus a slow poll as a safety net so the board never goes
  // stale if a realtime event is dropped (connection blip, tab backgrounded, etc.).
  useEffect(() => {
    const unsub = subscribeToAuction(state.contest.id, state.config.tournamentId, () => router.refresh());
    const iv = setInterval(() => router.refresh(), 4000);
    return () => { unsub(); clearInterval(iv); };
  }, [state.contest.id, state.config.tournamentId, router]);

  return projector ? <ProjectorBoard state={state} /> : <MemberBoard state={state} viewerId={viewerId} />;
}

/* ------------------------------------------------------------------ projector */

function ProjectorBoard({ state }: { state: AuctionState }) {
  const { participants, onBlock, currentId, onDeckId, results, config } = state;
  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const complete = config.complete;
  const teamsPerPlayer = config.teamsPerPlayer;

  // The nomination order is the (static) draft order. The highlight moves down it as picks
  // land; auto-scroll keeps the current nominator centered (mirrors the v1 calcutta board).
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentId]);

  // Standings order when complete (points, then fewest spent); draft order while live.
  const ordered = complete
    ? [...participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents)
    : participants;

  // Measure the grid area and fit every card into it (no scroll — cards resize to fit).
  const gridRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setArea((a) => (Math.abs(a.w - r.width) > 1 || Math.abs(a.h - r.height) > 1 ? { w: r.width, h: r.height } : a));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Cards are a single row of cells, so the tallest is the base (teamsPerPlayer) card — bonus
  // teams only add cells and shrink them. Reserve for the most required slots in the field.
  const maxReq = ordered.reduce((m, p) => Math.max(m, p.teams.length), teamsPerPlayer);
  const measured = area.w > 40 && area.h > 40;
  const layout = measured
    ? fitLayout(area.w, area.h, ordered.length, maxReq)
    : { cols: Math.min(ordered.length || 1, 4), cardW: 240 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--bg, #f6f7f5)", color: "var(--ink)", display: "flex", overflow: "hidden" }}>
      {/* Left rail: up next */}
      {!complete && (
        <aside style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--line)", background: "var(--card)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 20px 10px" }}>
            <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)" }}>Up next</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {ordered.map((p, i) => {
              const now = p.userId === currentId;
              const deck = p.userId === onDeckId;
              const done = p.done;
              return (
                <div key={p.userId} ref={now ? activeRef : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: now ? "14px 16px" : "9px 16px", borderRadius: 12,
                    background: now ? "var(--brand)" : "transparent", color: now ? "#fff" : "var(--ink)",
                    border: now ? "none" : `1px solid ${deck ? "var(--brand)" : "var(--line)"}`,
                    opacity: done && !now ? 0.4 : 1, transition: "background 0.3s, padding 0.3s",
                  }}>
                  <span style={{ fontSize: now ? "1rem" : "0.82rem", fontWeight: 800, opacity: now ? 0.9 : 0.45, width: 20, textAlign: "center" }}>{now ? "▶" : i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: now ? "1.35rem" : "1.05rem", fontWeight: now ? 800 : 600, textDecoration: done && !now ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{p.paidTeams}/{teamsPerPlayer}</span>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Main — no title/status chrome; space is at a premium so everything fits one screen.
          The hero holds a flexible top region (constant size, so the layout never snaps as the
          lot changes or data refreshes); the participant grid is anchored to the bottom. */}
      <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!state.tournament && (
          <p style={{ padding: "28px", fontSize: "1.3rem", color: "var(--ink-soft)" }}>This auction isn&apos;t set up yet.</p>
        )}

        {/* Hero region — a fixed share of the screen; content stays centered. The grid below
            gets the rest and sizes its cards to fit, so nothing runs off-screen. */}
        {!complete && state.tournament && (
          <div style={{ flex: "0 0 40%", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px 28px", overflow: "hidden" }}>
            {onBlock ? (
              <div key={onBlock.id} className={styles.boardLotIn} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                  {onBlock.logo_url && <img src={onBlock.logo_url} alt="" style={{ width: 150, height: 150, objectFit: "contain" }} />}
                  <div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--ink-soft)" }}>#{onBlock.seed}{onBlock.region ? ` ${onBlock.region}` : ""}</div>
                    <div style={{ fontSize: "4.5rem", lineHeight: 1.02, fontWeight: 900 }}>{onBlock.name}</div>
                  </div>
                </div>
                {onBlock.bundledThrowIn && (() => {
                  const ti = onBlock.bundledThrowIn;
                  const logos = ti.logo_url ? [ti.logo_url] : ti.memberLogos; // resolved → one; play-in → both
                  return (
                    <div style={{ margin: "14px 0 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: "1.3rem", color: "var(--ink-soft)" }}>
                      <span>includes ({ti.seed})</span>
                      {logos.map((l, i) => <img key={i} src={l} alt="" style={{ width: 34, height: 34, objectFit: "contain" }} />)}
                      <span>{ti.name}</span>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div key={currentId ?? "none"} className={styles.boardLotIn} style={{ textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "1rem", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, color: "var(--ink-soft)" }}>Nominating</p>
                <p style={{ margin: "6px 0 0", fontSize: "3.4rem", fontWeight: 900, color: "var(--brand)" }}>{currentId ? nameOf(currentId) : "—"}</p>
                <p style={{ margin: "8px 0 0", fontSize: "1.1rem", color: "var(--ink-soft)" }}>naming the next team up</p>
              </div>
            )}
          </div>
        )}

        {complete && results.championName && (
          <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "20px 28px" }}>
            <p style={{ margin: 0, fontSize: "1.9rem", fontWeight: 900 }}>🏆 {results.championName}{results.championOwnerId ? `, ${nameOf(results.championOwnerId)}` : ""}</p>
            {results.runnerUpName && <p style={{ margin: "6px 0 0", fontSize: "1.2rem", color: "var(--ink-soft)" }}>Runner-up {results.runnerUpName}{results.runnerUpOwnerId ? ` (${nameOf(results.runnerUpOwnerId)})` : ""}</p>}
          </div>
        )}

        {/* Participant grid — takes the remaining space; cards are sized to fit it exactly */}
        <div ref={gridRef} style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", padding: "8px 20px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gap: GRID_GAP, alignContent: "start", justifyContent: "center" }}>
            {ordered.map((p, i) => (
              <AuctionPlayerCard key={p.userId} p={p} teamsPerPlayer={teamsPerPlayer} width={layout.cardW} highlight={!complete && p.userId === currentId}
                rank={complete ? i + 1 : null} champ={p.userId === results.championOwnerId} showPoints={complete} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/* --------------------------------------------------------------------- member */

function MemberBoard({ state, viewerId }: { state: AuctionState; viewerId: string | null }) {
  const { participants, onBlock, currentId, onDeckId, results, config } = state;
  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const complete = config.complete;

  const ordered = complete
    ? [...participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents)
    : participants;

  return (
    <div style={{ maxWidth: 400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>{state.contest.name || "Auction"}</h1>
        <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)", fontWeight: 700 }}>
          {complete ? "Final" : onBlock ? "Live" : "Draft"}{state.tournament ? `, ${state.tournament.name}` : ""}
        </span>
      </div>

      {(results.championOwnerId || results.runnerUpOwnerId) && (
        <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>
          {results.championName && <span><strong style={{ color: "var(--brand)" }}>Champion: {results.championName}</strong>{results.championOwnerId ? ` (${nameOf(results.championOwnerId)})` : ""}</span>}
          {results.runnerUpName && <span style={{ color: "var(--ink-soft)" }}>{"  "}Runner-up: {results.runnerUpName}{results.runnerUpOwnerId ? ` (${nameOf(results.runnerUpOwnerId)})` : ""}</span>}
        </p>
      )}

      {!state.tournament && (
        <p style={{ marginTop: 14, color: "var(--ink-soft)", fontSize: "0.9rem" }}>This auction isn&apos;t set up yet. Check back soon.</p>
      )}

      {!complete && onBlock && (
        <div style={{ marginTop: 14, border: "2px solid var(--brand)", borderRadius: 14, padding: 14, textAlign: "center", background: "var(--card)" }}>
          <p style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800, color: "var(--brand)", margin: 0 }}>On the block</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 8 }}>
            {onBlock.logo_url && <img src={onBlock.logo_url} alt="" width={32} height={32} style={{ objectFit: "contain" }} />}
            <span style={{ fontSize: "1.4rem", fontWeight: 800 }}>({onBlock.seed}) {onBlock.name}</span>
          </div>
          {onBlock.bundledThrowIn && (
            <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", margin: "6px 0 0" }}>includes ({onBlock.bundledThrowIn.seed}) {onBlock.bundledThrowIn.name}</p>
          )}
        </div>
      )}

      {!complete && currentId && (
        <p style={{ marginTop: 12, fontSize: "0.9rem" }}>
          <span style={{ color: "var(--ink-soft)", fontWeight: 700 }}>Nominating </span><strong style={{ color: "var(--brand)" }}>{nameOf(currentId)}</strong>
          {onDeckId && <span style={{ color: "var(--ink-soft)" }}>, on deck {nameOf(onDeckId)}</span>}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: 16 }}>
        {ordered.map((p, i) => {
          const isViewer = p.userId === viewerId;
          const champ = p.userId === results.championOwnerId;
          return (
            <div key={p.userId} style={{ border: `1px solid ${isViewer ? "var(--brand)" : "var(--line)"}`, borderWidth: isViewer ? 2 : 1, borderRadius: 10, padding: 10, background: "var(--card)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontSize: "0.88rem" }}>{complete ? `${i + 1}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
                <span style={{ fontWeight: 800, color: "var(--brand)", fontSize: "0.88rem" }}>{complete ? `${p.points} pts` : money(p.remainingCents)}</span>
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)", marginBottom: 6 }}>
                {complete ? `${money(p.spentCents)} spent` : `${p.paidTeams}/${config.teamsPerPlayer} lots${p.done ? ", done" : ""}`}
              </div>
              {p.teams.length === 0 ? <p style={{ fontSize: "0.75rem", color: "var(--ink-soft)", margin: 0 }}>—</p> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {p.teams.map((t) => (
                    <div key={t.entityId} style={{ fontSize: "0.76rem", display: "flex", justifyContent: "space-between", gap: 6 }}>
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
