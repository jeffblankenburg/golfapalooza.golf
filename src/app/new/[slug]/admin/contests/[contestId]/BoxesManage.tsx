"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./BoxesManage.module.css";
import BoxesGrid from "@/components/v2/contests/BoxesGrid";
import type { BoxesGridState } from "@/lib/v2/contests/boxes";

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
const mdy = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : "";

/** Dropdown label for the admin game selector — kickoff first, then matchup + status. */
function gameOptionLabel(x: ManageGame): string {
  const m = `${x.teamRow?.abbrev ?? "Away"} @ ${x.teamCol?.abbrev ?? "Home"}`;
  const when = x.startTime ? mdy(x.startTime) : "TBD";
  const status = x.locked ? "" : x.revealAt ? ` (reveals ${shortDate(x.revealAt)})` : " (hidden)";
  return `${when} - ${m}${status}`;
}

export interface PayoutRow {
  name: string;
  totalCents: number;
  lines: { label: string; amountCents: number }[];
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

const PHASE_LABEL: Record<string, string> = {
  setup: "Setup",
  primary: "Primary draft open",
  secondary: "Secondary draft open",
  closed: "Picks closed",
  locked: "Board locked",
  final: "Final",
};

export default function BoxesManage({
  orgId,
  slug,
  contestId,
  name,
  phase,
  cellCostCents,
  games,
  owners,
  claimed,
  payoutsByGame,
  scoredGameIds,
}: {
  orgId: string;
  slug: string;
  contestId: string;
  name: string;
  phase: string;
  cellCostCents: number;
  games: ManageGame[];
  owners: Record<string, string>;
  claimed: number;
  payoutsByGame: Record<string, PayoutRow[]>;
  scoredGameIds: string[];
}) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDraw, setConfirmDraw] = useState(false);

  const g = games[sel];
  const grid: BoxesGridState = { owners, rowDigits: g?.rowDigits ?? [], colDigits: g?.colDigits ?? [] };
  const drawn = games.length > 0 && games.every((x) => x.locked);
  const revealedCount = games.filter((x) => x.locked).length;
  const allConcluded = games.length > 0 && games.every((x) => x.final);
  const full = claimed >= 100;

  async function doAction(action: string, extra?: Record<string, unknown>) {
    if (busy) return;
    setBusy(action + (extra?.gameId ? `:${extra.gameId}` : ""));
    setErr(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}/contests/${contestId}/boxes/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || "Action failed.");
      else {
        setConfirmDraw(false);
        router.refresh();
      }
    } catch {
      setErr("Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href={`/new/${slug}/admin/contests`} className={styles.back}>← Contests</Link>
        <span className={styles.topActions}>
          <Link href={`/new/${slug}/admin/contests/${contestId}/payouts`} className={styles.edit}>Payouts</Link>
          <Link href={`/new/${slug}/contests/${contestId}`} className={styles.edit}>Player view</Link>
          <Link href={`/new/${slug}/admin/contests?edit=${contestId}`} className={styles.edit}>Edit settings</Link>
        </span>
      </div>

      <div className={styles.head}>
        <h1 className={styles.title}>{name}</h1>
        <div className={styles.meta}>
          <span className={styles.phase} data-phase={phase}>{PHASE_LABEL[phase] ?? phase}</span>
          <span className={styles.claimed}>{claimed}/100 squares</span>
        </div>
      </div>

      {/* Lifecycle controls */}
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
                <span className={styles.confirmText}>This locks the board (ownership frozen). Numbers then reveal <strong>per game</strong> — a week before each kickoff by default, or whenever you hit &ldquo;Reveal now.&rdquo; Lock it in?</span>
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
        {phase === "locked" && (
          <div className={styles.lockedControls}>
            <span className={styles.revealCount}>{revealedCount}/{games.length} games revealed</span>
            {!drawn && (
              <span className={styles.lockedBtns}>
                <button type="button" className={styles.actionGhost} disabled={!!busy} onClick={() => doAction("reveal_all")}>Reveal all now</button>
              </span>
            )}
          </div>
        )}
        {phase === "final" && (
          <button type="button" className={styles.archiveLink} disabled={!!busy} onClick={() => doAction("unarchive")}>Unarchive this pool</button>
        )}
        {err && <p className={styles.err}>{err}</p>}
      </div>

      {/* Game selector (which game's numbers to view) */}
      {games.length > 1 && (
        <select className={styles.gamePick} value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Pick a game">
          {games.map((x, i) => (
            <option key={x.id} value={i}>{gameOptionLabel(x)}</option>
          ))}
        </select>
      )}

      {/* Selected game: kickoff + its reveal status/controls + the board */}
      {g && (
        <div className={styles.selGame}>
          <div className={styles.gameTop}>
            <span className={styles.gameName}>{g.label}</span>
            <span className={styles.gameKick}>{g.startTime ? `Kickoff ${whenLabel(g.startTime)}` : "Kickoff TBD"}</span>
          </div>
          {g.locked ? (
            <div className={styles.gameRevRow}><span className={styles.gameState} data-locked>Numbers revealed ✓</span></div>
          ) : phase === "locked" ? (
            <div className={styles.gameRevRow}>
              <span className={styles.revLabel}>Reveal numbers</span>
              <span className={styles.revealControls}>
                <input
                  className={styles.revealInput}
                  type="datetime-local"
                  value={isoToLocal(g.revealAt)}
                  onChange={(e) => doAction("schedule_reveal", { gameId: g.id, revealAt: localToISO(e.target.value) })}
                />
                <button type="button" className={styles.revealNow} disabled={!!busy} onClick={() => doAction("reveal_game", { gameId: g.id })}>Reveal now</button>
              </span>
            </div>
          ) : (
            <div className={styles.gameRevRow}><span className={styles.gameState}>{g.revealAt ? `Reveals ${whenLabel(g.revealAt)}` : "Awaiting board lock"}</span></div>
          )}
          <BoxesGrid
            grid={grid}
            teamRow={{ label: g.teamRow?.name ?? g.teamRow?.abbrev ?? "Away", sub: "away", color: g.teamRow?.color ?? null, logo: g.teamRow?.logo ?? null }}
            teamCol={{ label: g.teamCol?.name ?? g.teamCol?.abbrev ?? "Home", sub: "home", color: g.teamCol?.color ?? null, logo: g.teamCol?.logo ?? null }}
          />
        </div>
      )}

      {g && (phase === "locked" || phase === "final") && (() => {
        const gp = payoutsByGame[g.id] ?? [];
        const scored = scoredGameIds.includes(g.id);
        return (
          <div className={styles.payouts}>
            <div className={styles.payHeadRow}>
              <h2 className={styles.payTitle}>Pay out, {g.label}</h2>
              <span className={styles.paySub}>auto-scored from ESPN, paid by you</span>
            </div>
            {gp.length === 0 ? (
              <p className={styles.payEmpty}>
                {!g.locked ? "Numbers aren't revealed for this game yet." : scored ? "No winners yet." : "No scores in yet — check back once this game is underway."}
              </p>
            ) : (
              gp.map((p) => (
                <div key={p.name} className={styles.payRow}>
                  <div className={styles.payTop}>
                    <span className={styles.payName}>{p.name}</span>
                    <span className={styles.payTotal}>{money(p.totalCents)}</span>
                  </div>
                  {p.lines.length > 0 && (
                    <div className={styles.payLines}>
                      {p.lines.map((l, i) => (
                        <span key={i} className={styles.payLine}>{l.label} <b>{money(l.amountCents)}</b></span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        );
      })()}

      {/* Quiet archive: only once every game has concluded. */}
      {phase === "locked" && allConcluded && (
        <div className={styles.archiveRow}>
          <button type="button" className={styles.archiveLink} disabled={!!busy} onClick={() => doAction("finalize")}>Archive this pool</button>
          <span className={styles.archiveNote}>Takes it off the home screen and stops auto-updates. Everyone paid? Archive it.</span>
        </div>
      )}
    </div>
  );
}
