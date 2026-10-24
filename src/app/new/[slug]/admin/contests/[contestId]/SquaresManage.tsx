"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./SquaresManage.module.css";
import SquaresGrid from "@/components/v2/contests/SquaresGrid";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import type { SquaresGridState, Cell } from "@/lib/v2/contests/squares";

export interface ManageGame {
  id: string;
  label: string;
  league: string;
  teamRow: { name?: string; abbrev?: string; color?: string; logo?: string } | null;
  teamCol: { name?: string; abbrev?: string; color?: string; logo?: string } | null;
  rowDigits: number[];
  colDigits: number[];
  locked: boolean;
  revealAt: string | null;
  startTime: string | null;
  final: boolean;
}

/** A square to light up on a game's board, badged with its period's value. */
export interface GameWinner {
  cell: Cell;
  label: string;
  amountCents: number;
}

export interface PayoutRow {
  userId: string;
  name: string;
  totalCents: number;
  paidCents: number;
  note: string | null;
  lines: { label: string; amountCents: number }[];
}

/** A game's box score: per-period points + running totals for each team. */
export interface GameBox {
  cols: string[]; // period column labels, e.g. ["Q1","Q2","Q3","Q4"] or ["1H","2H"]
  away: { abbrev: string; pts: (number | null)[]; cum: (number | null)[]; total: number | null };
  home: { abbrev: string; pts: (number | null)[]; cum: (number | null)[]; total: number | null };
}

const isoToLocal = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const localToISO = (s: string): string | null => (s ? new Date(s).toISOString() : null);
const whenLabel = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
const shortDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

const PHASE_LABEL: Record<string, string> = {
  setup: "Setup",
  primary: "Primary draft open",
  secondary: "Secondary draft open",
  closed: "Picks closed",
  locked: "Board locked",
  final: "Final",
};

/** A game's reveal/scoring status for the accordion header chip. */
function gameStatus(g: ManageGame): { label: string; tone: string } {
  if (g.final) return { label: "Final", tone: "final" };
  if (g.locked) return { label: "Numbers revealed", tone: "revealed" };
  if (g.revealAt) return { label: `Reveals ${shortDate(g.revealAt)}`, tone: "scheduled" };
  return { label: "Numbers hidden", tone: "hidden" };
}

export default function SquaresManage({
  base,
  backHref,
  payoutsHref,
  playerHref,
  editHref,
  name,
  phase,
  games,
  owners,
  claimed,
  payoutsByGame,
  winnersByGame,
  scoresByGame,
  scoredGameIds,
}: {
  // Scope-agnostic: `base` is this contest's API root; the hrefs are the admin
  // links (back / payouts / player view / edit) for whichever scope mounted it.
  base: string;
  backHref: string;
  payoutsHref: string;
  playerHref: string;
  editHref?: string;
  name: string;
  phase: string;
  cellCostCents: number;
  games: ManageGame[];
  owners: Record<string, string>;
  claimed: number;
  payoutsByGame: Record<string, PayoutRow[]>;
  winnersByGame: Record<string, GameWinner[]>;
  scoresByGame: Record<string, GameBox>;
  scoredGameIds: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [revealTarget, setRevealTarget] = useState<ManageGame | null>(null);
  // Which game accordions are open (first active game open by default).
  const [openGames, setOpenGames] = useState<Set<string>>(() => {
    const first = games.find((g) => !g.final);
    return new Set(first ? [first.id] : []);
  });
  // Which payout row is expanded (`${gameId}:${userId}`) + its editable note.
  const [openPay, setOpenPay] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const allConcluded = games.length > 0 && games.every((x) => x.final);
  const full = claimed >= 100;

  const active = games.filter((g) => !g.final);
  const completed = games.filter((g) => g.final);

  const canReveal = (g: ManageGame) => !g.locked && (phase === "closed" || phase === "locked");

  function toggleGame(id: string) {
    setOpenGames((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function doAction(action: string, extra?: Record<string, unknown>, busyKey?: string) {
    if (busy) return;
    setBusy(busyKey ?? action);
    setErr(null);
    try {
      const res = await fetch(`${base}/squares/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || "Action failed.");
      else {
        setConfirmDraw(false);
        setRevealTarget(null);
        router.refresh();
      }
    } catch {
      setErr("Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  function renderPayout(gameId: string, p: PayoutRow) {
    const key = `${gameId}:${p.userId}`;
    const owed = Math.max(0, p.totalCents - p.paidCents);
    const paid = p.paidCents >= p.totalCents && p.totalCents > 0;
    const isOpen = openPay === key;
    const draft = noteDrafts[key] ?? p.note ?? "";
    return (
      <div key={p.userId} className={styles.payRow} data-paid={paid || undefined}>
        <button type="button" className={styles.payRowHead} onClick={() => setOpenPay(isOpen ? null : key)}>
          <span className={styles.payName}>
            {p.name}
            {paid && p.note && <span className={styles.payNoteTag}>{p.note}</span>}
          </span>
          <span className={styles.payAmt}>
            {paid ? (
              <span className={styles.paidTag}>Paid ✓</span>
            ) : p.paidCents > 0 ? (
              <span className={styles.owedTag}>owes {money(owed)}</span>
            ) : (
              <span className={styles.wonTag}>{money(p.totalCents)}</span>
            )}
          </span>
        </button>
        {isOpen && (
          <div className={styles.payBody}>
            {p.lines.length > 0 && (
              <div className={styles.payLines}>
                {p.lines.map((l, i) => (
                  <span key={i} className={styles.payLine}>{l.label} <b>{money(l.amountCents)}</b></span>
                ))}
              </div>
            )}
            <label className={styles.noteField}>
              <span className={styles.noteLabel}>Note (how they were paid)</span>
              <input
                className={styles.noteInput}
                value={draft}
                onChange={(e) => setNoteDrafts((d) => ({ ...d, [key]: e.target.value }))}
                placeholder="e.g. Venmo, cash, mailed check"
                maxLength={200}
              />
            </label>
            <div className={styles.payActions}>
              {paid ? (
                <button type="button" className={styles.unmark} disabled={busy === key} onClick={() => doAction("unmark_paid", { userId: p.userId, gameId }, key)}>Mark unpaid</button>
              ) : (
                <button type="button" className={styles.markPaid} disabled={busy === key} onClick={() => doAction("mark_paid", { userId: p.userId, gameId, paidCents: p.totalCents, note: draft }, key)}>Mark {money(owed)} paid</button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderScore(box: GameBox) {
    const n = box.cols.length;
    const style = { gridTemplateColumns: `2.6em repeat(${n + 1}, 1fr)` } as React.CSSProperties;
    const val = (v: number | null) => (v == null ? "–" : v);
    return (
      <div className={styles.score} style={style}>
        <span className={styles.scoreCorner} />
        {box.cols.map((c) => <span key={c} className={styles.scoreCol}>{c}</span>)}
        <span className={styles.scoreCol}>F</span>

        <span className={styles.scoreTeam}>{box.away.abbrev}</span>
        {box.away.pts.map((p, i) => <span key={i} className={styles.scoreVal}>{val(p)}</span>)}
        <span className={`${styles.scoreVal} ${styles.scoreTot}`}>{val(box.away.total)}</span>

        <span className={styles.scoreTeam}>{box.home.abbrev}</span>
        {box.home.pts.map((p, i) => <span key={i} className={styles.scoreVal}>{val(p)}</span>)}
        <span className={`${styles.scoreVal} ${styles.scoreTot}`}>{val(box.home.total)}</span>

        <span className={styles.scoreSub}>Running total</span>

        <span className={styles.scoreTeam} data-cum>{box.away.abbrev}</span>
        {box.away.cum.map((v, i) => <span key={i} className={styles.scoreVal} data-cum>{val(v)}</span>)}
        <span className={styles.scoreVal} data-cum />

        <span className={styles.scoreTeam} data-cum>{box.home.abbrev}</span>
        {box.home.cum.map((v, i) => <span key={i} className={styles.scoreVal} data-cum>{val(v)}</span>)}
        <span className={styles.scoreVal} data-cum />
      </div>
    );
  }

  function renderGame(g: ManageGame) {
    const isOpen = openGames.has(g.id);
    const st = gameStatus(g);
    const grid: SquaresGridState = { owners, rowDigits: g.rowDigits, colDigits: g.colDigits };
    const winners = winnersByGame[g.id] ?? [];
    const payouts = payoutsByGame[g.id] ?? [];
    const scored = scoredGameIds.includes(g.id);
    return (
      <div key={g.id} className={styles.game} data-open={isOpen || undefined}>
        <div className={styles.gameHead}>
          <button type="button" className={styles.gameHeadMain} onClick={() => toggleGame(g.id)} aria-expanded={isOpen}>
            <span className={styles.gameHeadText}>
              <span className={styles.gameName}>{g.label}</span>
              <span className={styles.gameWhen}>{g.startTime ? whenLabel(g.startTime) : "Kickoff TBD"}</span>
            </span>
            <span className={styles.gameStatus} data-tone={st.tone}>{st.label}</span>
            <svg className={styles.chev} data-open={isOpen || undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
          {canReveal(g) && (
            <button type="button" className={styles.revealIcon} onClick={() => setRevealTarget(g)} aria-label="Reveal numbers" title="Reveal numbers">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
        </div>
        {isOpen && (
          <div className={styles.gameBody}>
            {!g.locked && phase === "locked" && (
              <div className={styles.revRow}>
                <span className={styles.revLabel}>Reveal numbers</span>
                <span className={styles.revControls}>
                  <input
                    className={styles.revInput}
                    type="datetime-local"
                    value={isoToLocal(g.revealAt)}
                    onChange={(e) => doAction("schedule_reveal", { gameId: g.id, revealAt: localToISO(e.target.value) })}
                  />
                  <button type="button" className={styles.revNow} disabled={!!busy} onClick={() => setRevealTarget(g)}>Reveal now</button>
                </span>
              </div>
            )}
            <SquaresGrid
              grid={grid}
              teamRow={{ label: g.teamRow?.name ?? g.teamRow?.abbrev ?? "Away", sub: "away", color: g.teamRow?.color ?? null, logo: g.teamRow?.logo ?? null }}
              teamCol={{ label: g.teamCol?.name ?? g.teamCol?.abbrev ?? "Home", sub: "home", color: g.teamCol?.color ?? null, logo: g.teamCol?.logo ?? null }}
              periodWinners={winners}
            />
            {scoresByGame[g.id] && renderScore(scoresByGame[g.id])}
            {g.locked && (
              <div className={styles.payouts}>
                <div className={styles.payHeadRow}>
                  <h3 className={styles.payTitle}>Payouts</h3>
                  <span className={styles.paySub}>auto-scored from ESPN, paid by you</span>
                </div>
                {payouts.length === 0 ? (
                  <p className={styles.payEmpty}>{scored ? "No winners yet." : "No scores in yet — check back once this game is underway."}</p>
                ) : (
                  payouts.map((p) => renderPayout(g.id, p))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href={backHref} className={styles.back}>← Contests</Link>
        <span className={styles.topActions}>
          <Link href={payoutsHref} className={styles.edit}>Payouts</Link>
          <Link href={playerHref} className={styles.edit}>Player view</Link>
          {editHref && <Link href={editHref} className={styles.edit}>Edit settings</Link>}
        </span>
      </div>

      <div className={styles.head}>
        <h1 className={styles.title}>{name}</h1>
        <div className={styles.meta}>
          <span className={styles.phase} data-phase={phase}>{PHASE_LABEL[phase] ?? phase}</span>
          <span className={styles.claimed}>{claimed}/100 squares</span>
        </div>
      </div>

      {/* Lifecycle controls — no pool-level action once the board is locked
          (numbers reveal per game, from each accordion), so the card is hidden
          then unless there's an error to show. */}
      {(phase !== "locked" || err) && (
      <div className={styles.controls}>
        {phase === "setup" && <button type="button" className={styles.action} disabled={!!busy} onClick={() => doAction("open_primary")}>Open primary draft</button>}
        {phase === "primary" && (
          <>
            <button type="button" className={styles.action} disabled={!!busy} onClick={() => doAction("open_secondary")}>Open secondary draft</button>
            <button type="button" className={styles.actionGhost} disabled={!!busy} onClick={() => doAction("close_picks")}>Close picks</button>
          </>
        )}
        {phase === "secondary" && <button type="button" className={styles.actionGhost} disabled={!!busy} onClick={() => doAction("close_picks")}>Close picks</button>}
        {phase === "closed" && (
          <>
            {confirmDraw ? (
              <div className={styles.confirm}>
                <span className={styles.confirmText}>This locks the board (ownership frozen). Numbers then reveal <strong>per game</strong> — a week before each kickoff by default, or whenever you hit the reveal button. Lock it in?</span>
                <div className={styles.confirmBtns}>
                  <button type="button" className={styles.action} disabled={!!busy} onClick={() => doAction("lock_board")}>Yes, lock the board</button>
                  <button type="button" className={styles.actionGhost} onClick={() => setConfirmDraw(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" className={styles.action} disabled={!!busy} onClick={() => setConfirmDraw(true)}>Lock board &amp; schedule reveals</button>
                <button type="button" className={styles.actionGhost} disabled={!!busy} onClick={() => doAction("reopen_secondary")}>Reopen picks</button>
              </>
            )}
            {!full && !confirmDraw && <p className={styles.warn}>Only {claimed}/100 squares are claimed — unclaimed winning squares pay no one.</p>}
          </>
        )}
        {phase === "final" && (
          <button type="button" className={styles.archiveLink} disabled={!!busy} onClick={() => doAction("unarchive")}>Unarchive this pool</button>
        )}
        {err && <p className={styles.err}>{err}</p>}
      </div>
      )}

      {/* Games — one accordion each, in kickoff order */}
      {active.length === 0 && completed.length === 0 ? (
        <p className={styles.noGames}>No games yet. Add some in Games &amp; payouts.</p>
      ) : (
        <div className={styles.gameList}>{active.map(renderGame)}</div>
      )}

      {completed.length > 0 && (
        <div className={styles.completedSection}>
          <h2 className={styles.completedTitle}>Completed</h2>
          <div className={styles.gameList}>{completed.map(renderGame)}</div>
        </div>
      )}

      {/* Quiet archive: only once every game has concluded. */}
      {phase === "locked" && allConcluded && (
        <div className={styles.archiveRow}>
          <button type="button" className={styles.archiveLink} disabled={!!busy} onClick={() => doAction("finalize")}>Archive this pool</button>
          <span className={styles.archiveNote}>Takes it off the home screen and stops auto-updates. Everyone paid? Archive it.</span>
        </div>
      )}

      <ConfirmModal
        open={!!revealTarget}
        title="Reveal the numbers?"
        message={
          <>Drawing the numbers for <strong>{revealTarget?.label}</strong> is <strong>irreversible</strong> — they&apos;re rolled once and can never be re-rolled. Locks the board first if it isn&apos;t already.</>
        }
        confirmLabel="Reveal numbers"
        cancelLabel="Not yet"
        destructive
        onConfirm={() => revealTarget && doAction("reveal_game", { gameId: revealTarget.id })}
        onCancel={() => setRevealTarget(null)}
      />
    </div>
  );
}
