"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import { upcomingThrowers } from "@/lib/v2/contests/auction";
import type { AuctionState, AuctionParticipant } from "@/lib/v2/contests/auction-server";

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
  useEffect(() => subscribeToAuction(state.contest.id, state.config.tournamentId, () => router.refresh()), [state.contest.id, state.config.tournamentId, router]);

  return projector ? <ProjectorBoard state={state} /> : <MemberBoard state={state} viewerId={viewerId} />;
}

/* ------------------------------------------------------------------ projector */

function ProjectorBoard({ state }: { state: AuctionState }) {
  const { participants, onBlock, currentId, results, config } = state;
  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const complete = config.complete;
  const teamsPerPlayer = config.teamsPerPlayer;

  // Up-next queue: draft order projected forward, skipping anyone who already holds all
  // their lots (and will keep skipping them as the auction plays out). The current
  // nominator is always first, so the rail "advances" on its own as picks land.
  const queueIds = complete ? [] : upcomingThrowers(participants.map((p) => ({ id: p.userId, paidTeams: p.paidTeams })), teamsPerPlayer, 18);

  // Standings order when complete (points, then fewest spent); draft order while live.
  const ordered = complete
    ? [...participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents)
    : participants;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--bg, #f6f7f5)", color: "var(--ink)", display: "flex", overflow: "hidden" }}>
      {/* Left rail: up next */}
      {!complete && (
        <aside style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--line)", background: "var(--card)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 20px 10px" }}>
            <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)" }}>Up next</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {queueIds.map((uid, i) => {
              const p = participants.find((x) => x.userId === uid);
              if (!p) return null;
              const now = i === 0;
              return (
                <div key={`${uid}-${i}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: now ? "14px 16px" : "9px 16px", borderRadius: 12, background: now ? "var(--brand)" : "transparent", color: now ? "#fff" : "var(--ink)", border: now ? "none" : "1px solid var(--line)" }}>
                  <span style={{ fontSize: now ? "1rem" : "0.82rem", fontWeight: 800, opacity: now ? 0.9 : 0.45, width: 20, textAlign: "center" }}>{now ? "▶" : i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: now ? "1.35rem" : "1.05rem", fontWeight: now ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{p.paidTeams}/{teamsPerPlayer}</span>
                </div>
              );
            })}
            {queueIds.length === 0 && <p style={{ color: "var(--ink-soft)", padding: "0 4px" }}>Everyone&apos;s full.</p>}
          </div>
        </aside>
      )}

      {/* Main — no title/status chrome; space is at a premium so everything fits one screen */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!state.tournament && (
          <p style={{ padding: "28px", fontSize: "1.3rem", color: "var(--ink-soft)" }}>This auction isn&apos;t set up yet.</p>
        )}

        {/* On-block hero (or waiting on a nomination) — stays big; the grid shrinks instead */}
        {!complete && state.tournament && (
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 28px 10px" }}>
            {onBlock ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
                  {onBlock.logo_url && <img src={onBlock.logo_url} alt="" style={{ width: 150, height: 150, objectFit: "contain" }} />}
                  <div>
                    <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--ink-soft)" }}>No. {onBlock.seed}</div>
                    <div style={{ fontSize: "4.5rem", lineHeight: 1.02, fontWeight: 900 }}>{onBlock.name}</div>
                  </div>
                </div>
                {onBlock.bundledThrowIn && <p style={{ margin: "12px 0 0", fontSize: "1.3rem", color: "var(--ink-soft)" }}>comes with ({onBlock.bundledThrowIn.seed}) {onBlock.bundledThrowIn.name} free</p>}
              </>
            ) : (
              <div style={{ textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "1rem", textTransform: "uppercase", letterSpacing: 1, fontWeight: 800, color: "var(--ink-soft)" }}>Nominating</p>
                <p style={{ margin: "6px 0 0", fontSize: "3.4rem", fontWeight: 900, color: "var(--brand)" }}>{currentId ? nameOf(currentId) : "—"}</p>
                <p style={{ margin: "8px 0 0", fontSize: "1.1rem", color: "var(--ink-soft)" }}>naming the next team up</p>
              </div>
            )}
          </div>
        )}

        {complete && results.championName && (
          <div style={{ flexShrink: 0, textAlign: "center", padding: "16px 28px 6px" }}>
            <p style={{ margin: 0, fontSize: "1.7rem", fontWeight: 900 }}>🏆 {results.championName}{results.championOwnerId ? `, ${nameOf(results.championOwnerId)}` : ""}</p>
            {results.runnerUpName && <p style={{ margin: "4px 0 0", fontSize: "1.1rem", color: "var(--ink-soft)" }}>Runner-up {results.runnerUpName}{results.runnerUpOwnerId ? ` (${nameOf(results.runnerUpOwnerId)})` : ""}</p>}
          </div>
        )}

        {/* Participant grid — fills the rest of the screen, compact enough to fit everyone */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 20px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))", gap: 10 }}>
            {ordered.map((p, i) => (
              <BoardParticipant key={p.userId} p={p} rank={complete ? i + 1 : null} isNow={!complete && p.userId === currentId} teamsPerPlayer={teamsPerPlayer} complete={complete} champ={p.userId === results.championOwnerId} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/** One participant card on the projector grid: name + balance, `teamsPerPlayer` permanent
 *  bordered slots filled only by real buys, then any free bonus teams flowing after. */
function BoardParticipant({ p, rank, isNow, teamsPerPlayer, complete, champ }: {
  p: AuctionParticipant; rank: number | null; isNow: boolean; teamsPerPlayer: number; complete: boolean; champ: boolean;
}) {
  const bonus = p.teams.flatMap((t) => (t.free ? [t.free] : []));
  return (
    <div style={{ border: `2px solid ${isNow ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: 10, background: "var(--card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6, marginBottom: 7 }}>
        <strong style={{ fontSize: "1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rank ? `${rank}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
        <span style={{ fontSize: "1rem", fontWeight: 900, color: "var(--brand)", flexShrink: 0 }}>{complete ? `${p.points} pts` : money(p.remainingCents)}</span>
      </div>
      {/* Permanent slots — one per required lot, filled by real buys in order */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${teamsPerPlayer}, 1fr)`, gap: 6 }}>
        {Array.from({ length: teamsPerPlayer }).map((_, i) => {
          const t = p.teams[i];
          return t ? (
            <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 3px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "var(--bg, #f6f7f5)" }}>
              {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: 30, height: 30, objectFit: "contain" }} /> : <div style={{ width: 30, height: 30 }} />}
              <span style={{ fontSize: "0.66rem", fontWeight: 700, textAlign: "center", lineHeight: 1.05, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>({t.seed}) {t.name}</span>
              <span style={{ fontSize: "0.64rem", color: "var(--ink-soft)" }}>{money(t.bidCents)}</span>
            </div>
          ) : (
            <div key={i} style={{ border: "1px dashed var(--line)", borderRadius: 8, minHeight: 68, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-soft)", opacity: 0.45 }}>—</div>
          );
        })}
      </div>
      {/* Bonus (free) teams flow after the permanent slots, visually distinct */}
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
          {onBlock.bundledThrowIn && <p style={{ fontSize: "0.8rem", color: "var(--ink-soft)", margin: "6px 0 0" }}>+ ({onBlock.bundledThrowIn.seed}) {onBlock.bundledThrowIn.name} free</p>}
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
