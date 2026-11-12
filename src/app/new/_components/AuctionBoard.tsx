"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import type { AuctionState, AuctionEntity, AuctionParticipant, AuctionPayouts } from "@/lib/v2/contests/auction-server";
import { SCORING_MODES } from "@/lib/v2/contests/auction";
import styles from "@/app/new/new.module.css";
import AuctionPlayerCard, { estimateLogoSize } from "./AuctionPlayerCard";

const GRID_GAP = 12;

/* Team-color helpers for the reveal. ESPN gives one hex per team; we derive a darker support
   shade for the secondary stripes and pick a readable text color by luminance. */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex: string, amt: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const [r, g, b] = rgb.map(f);
  return `rgb(${r}, ${g}, ${b})`;
}
function contrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#17211c" : "#ffffff";
}

/** Pick the grid (cols × rows) whose cards FILL the `W`×`H` area with the biggest logos. Every
 *  card fills a `cardW`×`cardH` slot, so we search column counts and keep the one that renders
 *  the largest logo (a wider card = wider cells = bigger logo, up to the point rows get short). */
function fitLayout(W: number, H: number, n: number, rowCap: number): { cols: number; rows: number; cardW: number; cardH: number } {
  if (n <= 0 || W <= 0 || H <= 0) return { cols: 1, rows: 1, cardW: W || 240, cardH: H || 160 };
  let best: { cols: number; rows: number; cardW: number; cardH: number; logo: number } | null = null;
  for (let cols = 1; cols <= n; cols++) {
    const cardW = (W - GRID_GAP * (cols - 1)) / cols;
    if (cardW < 150) break; // too narrow for a readable row of cells; stop adding columns
    const rows = Math.ceil(n / cols);
    const cardH = (H - GRID_GAP * (rows - 1)) / rows;
    if (cardH < 80) continue; // too short to be useful
    const logo = estimateLogoSize(cardW, cardH, rowCap);
    if (!best || logo > best.logo || (logo === best.logo && cols > best.cols)) best = { cols, rows, cardW, cardH, logo };
  }
  if (!best) {
    let cols = 1;
    for (let c = 1; c <= n; c++) if ((W - GRID_GAP * (c - 1)) / c >= 130) cols = c;
    const rows = Math.ceil(n / cols);
    return { cols, rows, cardW: (W - GRID_GAP * (cols - 1)) / cols, cardH: (H - GRID_GAP * (rows - 1)) / rows };
  }
  return { cols: best.cols, rows: best.rows, cardW: best.cardW, cardH: best.cardH };
}

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/**
 * Read-only auction board, live via realtime. Two looks:
 *  - `projector`: a full-screen big-screen display for the table — no app chrome, a left
 *    rail of upcoming nominators (skip-aware), the lot on the block huge, and a grid of
 *    every participant's lots + remaining balance below.
 *  - member: the same data phone-width inside the app shell, the viewer's column highlighted.
 * Picks, the lot on the block, and grading all push automatically.
 */
export default function AuctionBoard({
  state, viewerId, payouts = null, projector = false,
}: {
  state: AuctionState; viewerId: string | null; payouts?: AuctionPayouts | null; projector?: boolean;
}) {
  const router = useRouter();
  // Realtime for instant updates, plus a slow poll as a safety net so the board never goes
  // stale if a realtime event is dropped (connection blip, tab backgrounded, etc.). This also
  // keeps points + payouts fresh on the member results board as tournament games finish.
  useEffect(() => {
    const unsub = subscribeToAuction(state.contest.id, state.config.tournamentId, () => router.refresh());
    const iv = setInterval(() => router.refresh(), 4000);
    return () => { unsub(); clearInterval(iv); };
  }, [state.contest.id, state.config.tournamentId, router]);

  return projector ? <ProjectorBoard state={state} /> : <MemberBoard state={state} viewerId={viewerId} payouts={payouts} />;
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

  // Reveal state machine: `disp` is the team the band currently shows, `phase` drives its
  // sweep. When the lot on the block changes we first play the old one OUT, then swap in the
  // new one (IN) — so a team both enters and exits with animation, never just pops.
  const [disp, setDisp] = useState<AuctionEntity | null>(onBlock);
  const [phase, setPhase] = useState<"in" | "out">(onBlock ? "in" : "out");
  useEffect(() => {
    const target = onBlock;
    if ((target?.id ?? null) === (disp?.id ?? null)) return; // unchanged (ignores refresh identity churn)
    if (!disp) {
      const t = setTimeout(() => { setDisp(target); setPhase("in"); }, 0); // nothing showing → bring the new one in
      return () => clearTimeout(t);
    }
    const out = setTimeout(() => setPhase("out"), 0); // something's showing → sweep it out…
    const swap = setTimeout(() => { setDisp(target); setPhase(target ? "in" : "out"); }, 420); // …then swap
    return () => { clearTimeout(out); clearTimeout(swap); };
  }, [onBlock, disp]);

  // The card grid is ALWAYS alphabetical by name, so a player is easy to find at a glance.
  // The "up next" rail keeps the nomination (draft) order, and finishing rank (shown on the
  // cards once complete) comes from a separate standings sort — not the grid position.
  const gridOrder = [...participants].sort((a, b) => a.name.localeCompare(b.name));
  const rankByUser = new Map(
    [...participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents).map((p, i) => [p.userId, i + 1]),
  );

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
  // Cells sit `rowCap` per row (capped so logos stay readable on a TV); a player holding more
  // than a row's worth wraps within their own card. Cards fill a uniform slot, sized to make
  // the logos as large as the screen allows.
  const rowCap = teamsPerPlayer;
  const measured = area.w > 40 && area.h > 40;
  const layout = measured
    ? fitLayout(area.w, area.h, gridOrder.length, rowCap)
    : { cols: Math.min(gridOrder.length || 1, 4), rows: 1, cardW: 240, cardH: 220 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--bg, #f6f7f5)", color: "var(--ink)", display: "flex", overflow: "hidden" }}>
      {/* Left rail: up next */}
      {!complete && (
        <aside style={{ width: 300, flexShrink: 0, borderRight: "1px solid var(--line)", background: "var(--card)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "18px 20px 10px" }}>
            <p style={{ margin: 0, fontSize: "0.8rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "var(--ink-soft)" }}>Up next</p>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {participants.map((p, i) => {
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

        {/* Hero region — the dramatic reveal band for the lot on the block (color stripes sweep
            in/out), or the "nominating" interstitial between lots. Fixed share so the grid never
            snaps as lots change. */}
        {!complete && state.tournament && (
          <div style={{ flex: "0 0 30%", minHeight: 0, overflow: "hidden" }}>
            {disp ? (
              <TeamReveal team={disp} phase={phase} />
            ) : (
              <NominatingReveal key={currentId ?? "none"} name={currentId ? nameOf(currentId) : "—"}
                avatarUrl={currentId ? participants.find((p) => p.userId === currentId)?.avatarUrl ?? null : null} />
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
        <div ref={gridRef} style={{ flex: "1 1 0", minHeight: 0, overflow: "visible", padding: "8px 20px 16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${layout.cols}, 1fr)`, gridTemplateRows: `repeat(${layout.rows}, 1fr)`, gap: GRID_GAP, height: "100%" }}>
            {gridOrder.map((p) => (
              <AuctionPlayerCard key={p.userId} p={p} teamsPerPlayer={teamsPerPlayer} width={layout.cardW} height={layout.cardH} rowCap={rowCap} highlight={!complete && p.userId === currentId}
                rank={complete ? rankByUser.get(p.userId) ?? null : null} champ={p.userId === results.championOwnerId} showPoints={complete} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

/** The on-the-block reveal: bold color stripes sweep in from the left behind a white logo
 *  plate + the team name/seed, and sweep out when the lot leaves. Falls back to the brand
 *  color for teams with no stored color (and for unresolved play-in lots, which show both
 *  teams' logos). `phase` ("in" | "out") is driven by the board's reveal state machine. */
function TeamReveal({ team, phase }: { team: AuctionEntity; phase: "in" | "out" }) {
  const hasColor = !!team.color && !!hexToRgb(team.color);
  const primary = hasColor ? team.color! : "var(--brand)";
  const sub = hasColor ? shade(team.color!, -0.3) : "rgba(0, 0, 0, 0.16)";
  const text = hasColor ? contrastText(team.color!) : "#ffffff";
  // One face logo normally; an unresolved play-in shows both teams' logos in the plate.
  const logos = (team.logo_url ? [team.logo_url] : team.cellTeams.map((t) => t.logo).filter((l): l is string => !!l));
  const ti = team.bundledThrowIn;
  const vars = { ["--team"]: primary, ["--team2"]: sub, ["--teamText"]: text } as React.CSSProperties;
  return (
    <div key={team.id} className={styles.boardReveal} data-phase={phase} style={vars}>
      <div className={`${styles.revealStripe} ${styles.revealStripeSub} ${styles.s1}`} />
      <div className={`${styles.revealStripe} ${styles.revealStripeMain}`} />
      <div className={`${styles.revealStripe} ${styles.revealStripeSub} ${styles.s2}`} />
      <div className={styles.revealContent}>
        {logos.length > 0 && (
          <div className={styles.revealPlate}>
            {logos.map((l, i) => (
              <img key={i} src={l} alt="" style={{ width: logos.length > 1 ? 104 : 148, height: logos.length > 1 ? 104 : 148, objectFit: "contain" }} />
            ))}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className={styles.revealSeed}>#{team.seed}{team.region ? ` ${team.region}` : ""}</div>
          <div className={styles.revealName}>{team.name}</div>
          {ti && (
            <div className={styles.revealRider}>
              includes ({ti.seed}) {ti.playInSlot ? ti.cellTeams.map((t) => t.shortName || t.name).join(" / ") : ti.short_name || ti.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Between lots: a distinct look from the team reveal — a brand band with slowly panning
 *  diagonal stripes and a gently pulsing member photo, content rising up as it changes. The
 *  member's photo (or their initial) sits in a pulsing ring. */
function NominatingReveal({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className={styles.nomBand}>
      <div className={styles.nomContent}>
        <div className={styles.nomAvatarWrap}>
          {avatarUrl
            ? <img src={avatarUrl} alt="" className={styles.nomAvatar} />
            : <div className={styles.nomFallback}>{name.charAt(0).toUpperCase()}</div>}
        </div>
        <div className={styles.nomText}>
          <div className={styles.nomLabel}>On the clock</div>
          <div className={styles.nomName}>{name}</div>
          <div className={styles.nomSub}>choosing the next team</div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- member */

/** The member board routes to one of three phase views off the contest state:
 *   - Lobby   (active, not live)   → who's in, the rules; the board stays hidden.
 *   - Live    (admin went live)    → the animated reveal banner + draft rotation + roster.
 *   - Results (auction complete)   → prizes, the viewer's result pinned, the points leaderboard.
 *  Phase 1 (draft) never reaches here — the page 404s members until the contest is active. */
function MemberBoard({ state, viewerId, payouts }: { state: AuctionState; viewerId: string | null; payouts: AuctionPayouts | null }) {
  const { config } = state;
  if (config.complete) return <ResultsView state={state} viewerId={viewerId} payouts={payouts} />;
  if (config.live) return <LiveView state={state} viewerId={viewerId} />;
  return <LobbyView state={state} viewerId={viewerId} />;
}

const SHELL = { maxWidth: 400, margin: "0 auto" } as const;

function BoardHeader({ name, status }: { name: string; status: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>{name || "Auction"}</h1>
      <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)", fontWeight: 700 }}>{status}</span>
    </div>
  );
}

/* ----- Phase 2: lobby -------------------------------------------------------- */

/** Pre-auction: the roster of who's playing + the ground rules. The throwout order stays
 *  hidden until the admin goes live, so a reshuffle before the first lot never spoils anything. */
function LobbyView({ state, viewerId }: { state: AuctionState; viewerId: string | null }) {
  const { participants, config, capacity } = state;
  const teamsPerPlayer = capacity.teamsPerPlayer || config.teamsPerPlayer;
  const scoring = SCORING_MODES.find((s) => s.value === config.scoringMode)?.label ?? "Seed number per win";
  const rules: { label: string; value: string }[] = [
    { label: "Salary cap", value: `${money(config.salaryCapCents)} to bid` },
    { label: "Teams each", value: `${teamsPerPlayer}` },
    { label: "Scoring", value: scoring },
  ];
  if (config.entryCents > 0) rules.push({ label: "Entry", value: money(config.entryCents) });

  return (
    <div style={SHELL}>
      <BoardHeader name={state.contest.name} status={state.tournament ? "Starting soon" : "Draft"} />

      {!state.tournament ? (
        <p style={{ marginTop: 14, color: "var(--ink-soft)", fontSize: "0.9rem" }}>This auction isn&apos;t set up yet. Check back soon.</p>
      ) : (
        <>
          <p style={{ marginTop: 10, fontSize: "0.9rem", color: "var(--ink-soft)" }}>
            The auction hasn&apos;t started yet. Here&apos;s who&apos;s in{state.tournament ? ` for ${state.tournament.name}` : ""}.
          </p>

          {/* Ground rules */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8, marginTop: 14 }}>
            {rules.map((r) => (
              <div key={r.label} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", background: "var(--card)" }}>
                <div style={{ fontSize: "0.64rem", textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 800, color: "var(--ink-soft)" }}>{r.label}</div>
                <div style={{ fontSize: "0.9rem", fontWeight: 700, marginTop: 2 }}>{r.value}</div>
              </div>
            ))}
          </div>

          {/* Roster */}
          <p className={styles.sectionLabel} style={{ margin: "18px 0 8px" }}>
            {participants.length} {participants.length === 1 ? "player" : "players"} in
          </p>
          {participants.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--ink-soft)", margin: 0 }}>No one&apos;s joined yet.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
              {/* Alphabetical — order is deliberately not revealed in the lobby. */}
              {[...participants].sort((a, b) => a.name.localeCompare(b.name)).map((p) => {
                const isViewer = p.userId === viewerId;
                return (
                  <div key={p.userId} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${isViewer ? "var(--brand)" : "var(--line)"}`, borderWidth: isViewer ? 2 : 1, borderRadius: 10, padding: "8px 10px", background: "var(--card)" }}>
                    {p.avatarUrl
                      ? <img src={p.avatarUrl} alt="" width={30} height={30} style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      : <span style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", background: "var(--brand-tint, #e8f2ec)", color: "var(--brand)", fontWeight: 800, fontSize: "0.85rem" }}>{p.name.charAt(0).toUpperCase()}</span>}
                    <span style={{ flex: 1, minWidth: 0, fontSize: "0.85rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}{isViewer ? " (you)" : ""}</span>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ marginTop: 16, fontSize: "0.8rem", color: "var(--ink-soft)" }}>The live board opens when the auction starts.</p>
        </>
      )}
    </div>
  );
}

/* ----- Phase 3: live --------------------------------------------------------- */

/** Live auction: the animated reveal banner (the lot on the block, or the nominator between
 *  lots) over the draft rotation + a roster of balances and lots. Mirrors the projector board
 *  at phone width, the viewer's row highlighted. */
function LiveView({ state, viewerId }: { state: AuctionState; viewerId: string | null }) {
  const { participants, onBlock, currentId, onDeckId, results, config } = state;
  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const [freeOf, setFreeOf] = useState<AuctionParticipant | null>(null);

  return (
    <div style={SHELL}>
      <BoardHeader name={state.contest.name} status={state.tournament ? `Live, ${state.tournament.name}` : "Live"} />

      <LiveBanner onBlock={onBlock} currentId={currentId} participants={participants} />

      {currentId && (
        <p style={{ marginTop: 12, fontSize: "0.9rem" }}>
          <span style={{ color: "var(--ink-soft)", fontWeight: 700 }}>Nominating </span><strong style={{ color: "var(--brand)" }}>{nameOf(currentId)}</strong>
          {onDeckId && <span style={{ color: "var(--ink-soft)" }}>, on deck {nameOf(onDeckId)}</span>}
        </p>
      )}

      <ParticipantGrid participants={participants} mode="balance" config={config} results={results} viewerId={viewerId} onOpenFree={setFreeOf} />
      {freeOf && <FreeTeamsModal participant={freeOf} onClose={() => setFreeOf(null)} />}
    </div>
  );
}

/** The reveal banner's state machine: play the current lot OUT, then swap the new one IN, so
 *  teams both enter and exit with animation (never just pop). Falls back to the nominator
 *  interstitial between lots. Compact (phone) variants of the projector reveal. */
function LiveBanner({ onBlock, currentId, participants }: { onBlock: AuctionEntity | null; currentId: string | null; participants: AuctionParticipant[] }) {
  const [disp, setDisp] = useState<AuctionEntity | null>(onBlock);
  const [phase, setPhase] = useState<"in" | "out">(onBlock ? "in" : "out");
  useEffect(() => {
    const target = onBlock;
    if ((target?.id ?? null) === (disp?.id ?? null)) return; // unchanged (ignores refresh identity churn)
    if (!disp) { const t = setTimeout(() => { setDisp(target); setPhase("in"); }, 0); return () => clearTimeout(t); }
    const out = setTimeout(() => setPhase("out"), 0);
    const swap = setTimeout(() => { setDisp(target); setPhase(target ? "in" : "out"); }, 420);
    return () => { clearTimeout(out); clearTimeout(swap); };
  }, [onBlock, disp]);

  const nom = participants.find((p) => p.userId === currentId) ?? null;
  return (
    <div className={styles.mBanner} style={{ marginTop: 14 }}>
      {disp
        ? <MemberTeamReveal team={disp} phase={phase} />
        : <MemberNominatingReveal key={currentId ?? "none"} name={nom?.name ?? "—"} avatarUrl={nom?.avatarUrl ?? null} />}
    </div>
  );
}

/** Compact team reveal — the stripe sweep + plate/name, phone-sized (reuses the projector's
 *  stripe animation classes; content is the smaller `m*` variants). */
function MemberTeamReveal({ team, phase }: { team: AuctionEntity; phase: "in" | "out" }) {
  const hasColor = !!team.color && !!hexToRgb(team.color);
  const primary = hasColor ? team.color! : "var(--brand)";
  const sub = hasColor ? shade(team.color!, -0.3) : "rgba(0, 0, 0, 0.16)";
  const text = hasColor ? contrastText(team.color!) : "#ffffff";
  const logos = team.logo_url ? [team.logo_url] : team.cellTeams.map((t) => t.logo).filter((l): l is string => !!l);
  const ti = team.bundledThrowIn;
  const vars = { ["--team"]: primary, ["--team2"]: sub, ["--teamText"]: text } as React.CSSProperties;
  return (
    <div key={team.id} className={styles.boardReveal} data-phase={phase} style={vars}>
      <div className={`${styles.revealStripe} ${styles.revealStripeSub} ${styles.s1}`} />
      <div className={`${styles.revealStripe} ${styles.revealStripeMain}`} />
      <div className={`${styles.revealStripe} ${styles.revealStripeSub} ${styles.s2}`} />
      <div className={styles.mRevealContent}>
        {logos.length > 0 && (
          <div className={styles.mRevealPlate}>
            {logos.map((l, i) => <img key={i} src={l} alt="" style={{ width: logos.length > 1 ? 34 : 52, height: logos.length > 1 ? 34 : 52, objectFit: "contain" }} />)}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div className={styles.mRevealSeed}>#{team.seed}{team.region ? ` ${team.region}` : ""}</div>
          <div className={styles.mRevealName}>{team.name}</div>
          {ti && (
            <div className={styles.mRevealRider}>
              includes ({ti.seed}) {ti.playInSlot ? ti.cellTeams.map((t) => t.shortName || t.name).join(" / ") : ti.short_name || ti.name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact nominating interstitial — the brand band + pulsing avatar, phone-sized. */
function MemberNominatingReveal({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  return (
    <div className={styles.nomBand} style={{ padding: "0 18px", gap: 16 }}>
      <div className={styles.mNomContent}>
        <div className={styles.nomAvatarWrap}>
          {avatarUrl ? <img src={avatarUrl} alt="" className={styles.mNomAvatar} /> : <div className={styles.mNomFallback}>{name.charAt(0).toUpperCase()}</div>}
        </div>
        <div className={styles.mNomText}>
          <div className={styles.mNomLabel}>On the clock</div>
          <div className={styles.mNomName}>{name}</div>
          <div className={styles.mNomSub}>choosing the next team</div>
        </div>
      </div>
    </div>
  );
}

/* ----- Phase 4: results ------------------------------------------------------ */

/** Auction closed: the prize board up top, the viewer's own result pinned for easy reference,
 *  then the full points standings — all of which keep updating (realtime + poll) as tournament
 *  games finish and points/winnings resolve. */
function ResultsView({ state, viewerId, payouts }: { state: AuctionState; viewerId: string | null; payouts: AuctionPayouts | null }) {
  const { participants, results, config } = state;
  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const [freeOf, setFreeOf] = useState<AuctionParticipant | null>(null);

  const standings = [...participants].sort((a, b) => b.points - a.points || a.spentCents - b.spentCents);
  const me = viewerId ? standings.find((p) => p.userId === viewerId) ?? null : null;
  const myPlace = me ? standings.indexOf(me) + 1 : null;
  const myWin = payouts && viewerId ? payouts.winners.find((w) => w.userId === viewerId) ?? null : null;
  const hasMoney = !!payouts && payouts.prizes.length > 0 && payouts.totalCents > 0;

  return (
    <div style={SHELL}>
      <BoardHeader name={state.contest.name} status={state.tournament ? `Final, ${state.tournament.name}` : "Final"} />

      {(results.championName || results.runnerUpName) && (
        <p style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>
          {results.championName && <span><strong style={{ color: "var(--brand)" }}>🏆 {results.championName}</strong>{results.championOwnerId ? ` (${nameOf(results.championOwnerId)})` : ""}</span>}
          {results.runnerUpName && <span style={{ color: "var(--ink-soft)" }}>{"  "}Runner-up {results.runnerUpName}{results.runnerUpOwnerId ? ` (${nameOf(results.runnerUpOwnerId)})` : ""}</span>}
        </p>
      )}

      {/* Prize board */}
      {hasMoney && (
        <div style={{ marginTop: 14 }}>
          <div className={styles.pickPot}>
            <span className={styles.pickPotTotal}>{money(payouts!.totalCents)} in prizes</span>
            {payouts!.potCents > 0 && <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)" }}>{money(payouts!.potCents)} pot</span>}
          </div>
          {myWin && (
            <p className={styles.pickYouMoney} data-in style={{ marginTop: 6 }}>
              {payouts!.ready ? <>You won <strong>{money(myWin.wonCents)}</strong></> : <>You&apos;re on track to win <strong>{money(myWin.wonCents)}</strong></>}
              {myWin.prizeLabels.length > 0 ? <span style={{ fontWeight: 600 }}> ({myWin.prizeLabels.join(", ")})</span> : null}
            </p>
          )}
          {!payouts!.ready && <p className={styles.pickMoneyNote} style={{ marginTop: 4 }}>Winnings resolve as the tournament plays out.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {payouts!.prizes.map((p) => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--card)" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: "0.82rem" }}>{p.label}</span>
                <span style={{ fontSize: "0.82rem", color: p.winnerName ? "var(--ink)" : "var(--ink-soft)" }}>{p.winnerName ?? "TBD"}</span>
                <span style={{ fontWeight: 800, color: "var(--brand)", minWidth: 54, textAlign: "right", fontSize: "0.82rem" }}>{money(p.amountCents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* The viewer's own result, pinned for quick reference */}
      {me && myPlace && (
        <div style={{ marginTop: 16, border: "2px solid var(--brand)", borderRadius: 12, padding: 12, background: "var(--brand-tint, #e8f2ec)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <strong style={{ fontSize: "0.95rem" }}>Your team, {ordinal(myPlace)} of {standings.length}</strong>
            <span style={{ fontWeight: 800, color: "var(--brand)" }}>{me.points} pts</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--ink-soft)", marginTop: 2 }}>{money(me.spentCents)} spent</div>
          {me.teams.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 8 }}>
              {me.teams.map((t) => (
                <div key={t.entityId} style={{ fontSize: "0.8rem", display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.name}</span>
                  <span style={{ color: "var(--ink-soft)" }}>{money(t.bidCents)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className={styles.sectionLabel} style={{ margin: "18px 0 8px" }}>Standings</p>
      <ParticipantGrid participants={standings} mode="points" config={config} results={results} viewerId={viewerId} onOpenFree={setFreeOf} ranked />
      {freeOf && <FreeTeamsModal participant={freeOf} onClose={() => setFreeOf(null)} />}
    </div>
  );
}

/* ----- shared roster grid ---------------------------------------------------- */

/** The participant cards shared by Live (remaining balance) and Results (points standings).
 *  `ranked` prefixes the place number; `onOpenFree` opens the free-rider modal via the "+N" badge. */
function ParticipantGrid({
  participants, mode, config, results, viewerId, onOpenFree, ranked = false,
}: {
  participants: AuctionParticipant[]; mode: "balance" | "points"; config: AuctionState["config"]; results: AuctionState["results"];
  viewerId: string | null; onOpenFree: (p: AuctionParticipant) => void; ranked?: boolean;
}) {
  const points = mode === "points";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginTop: ranked ? 0 : 16 }}>
      {participants.map((p, i) => {
        const isViewer = p.userId === viewerId;
        const champ = p.userId === results.championOwnerId;
        const freeCount = p.teams.reduce((n, t) => n + (t.free ? 1 : 0), 0);
        return (
          <div key={p.userId} style={{ position: "relative", border: `1px solid ${isViewer ? "var(--brand)" : "var(--line)"}`, borderWidth: isViewer ? 2 : 1, borderRadius: 10, padding: 10, background: "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
              <strong style={{ fontSize: "0.88rem" }}>{ranked ? `${i + 1}. ` : ""}{p.name}{champ ? " 🏆" : ""}</strong>
              <span style={{ fontWeight: 800, color: "var(--brand)", fontSize: "0.88rem" }}>{points ? `${p.points} pts` : money(p.remainingCents)}</span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "var(--ink-soft)", marginBottom: 6 }}>
              {points ? `${money(p.spentCents)} spent` : `${p.paidTeams}/${config.teamsPerPlayer} lots${p.done ? ", done" : ""}`}
            </div>
            {p.teams.length === 0 ? <p style={{ fontSize: "0.75rem", color: "var(--ink-soft)", margin: 0 }}>—</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {/* Official picks only; free riders live behind the "+N" badge. */}
                {p.teams.map((t) => (
                  <div key={t.entityId} style={{ fontSize: "0.76rem", display: "flex", justifyContent: "space-between", gap: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.name}</span>
                    <span style={{ color: "var(--ink-soft)" }}>{money(t.bidCents)}</span>
                  </div>
                ))}
              </div>
            )}
            {freeCount > 0 && (
              <button type="button" onClick={() => onOpenFree(p)} aria-label={`+${freeCount} free team${freeCount === 1 ? "" : "s"}`}
                style={{ position: "absolute", right: -9, bottom: -9, minWidth: 26, height: 26, padding: "0 8px", borderRadius: 999, background: "var(--brand)", color: "#fff", border: "2px solid var(--card)", fontWeight: 800, fontSize: "0.72rem", lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 7px rgba(0,0,0,0.22)" }}>
                +{freeCount}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Read-only modal listing a player's free rider teams (member view). Tapping the card's
 *  "+N" badge opens it; resolved riders show one logo, unresolved play-ins show both. */
function FreeTeamsModal({ participant, onClose }: { participant: AuctionParticipant; onClose: () => void }) {
  const frees = participant.teams.flatMap((t) => (t.free ? [t.free] : []));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(23, 33, 29, 0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--card)", borderRadius: 16, padding: 18, width: "100%", maxWidth: 340, maxHeight: "80vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <strong style={{ fontSize: "1rem" }}>{participant.name}&apos;s free teams</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: "1.1rem", cursor: "pointer", color: "var(--ink-soft)", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {frees.map((f, i) => {
            const teams = f.logo_url
              ? [{ logo: f.logo_url, label: f.short_name || f.name }]
              : f.cellTeams.map((t) => ({ logo: t.logo, label: t.shortName || t.name }));
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", gap: 4, flex: "none" }}>
                  {teams.map((t, j) => (t.logo ? <img key={j} src={t.logo} alt="" width={30} height={30} style={{ objectFit: "contain" }} /> : <div key={j} style={{ width: 30, height: 30 }} />))}
                </div>
                <span style={{ fontSize: "0.9rem", flex: 1, minWidth: 0 }}>({f.seed}) {teams.map((t) => t.label).join(" / ")}</span>
                <span style={{ fontSize: "0.78rem", color: "var(--brand)", fontWeight: 700 }}>free</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
