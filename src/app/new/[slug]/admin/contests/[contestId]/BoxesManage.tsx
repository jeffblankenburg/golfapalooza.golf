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
  teamRow: { name?: string; abbrev?: string } | null;
  teamCol: { name?: string; abbrev?: string } | null;
  rowDigits: number[];
  colDigits: number[];
  locked: boolean;
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
  locked: "Numbers locked",
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
  payouts,
  anyScored,
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
  payouts: PayoutRow[];
  anyScored: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDraw, setConfirmDraw] = useState(false);

  const g = games[sel];
  const grid: BoxesGridState = { owners, rowDigits: g?.rowDigits ?? [], colDigits: g?.colDigits ?? [] };
  const drawn = games.length > 0 && games.every((x) => x.locked);
  const full = claimed >= 100;

  async function doAction(action: string) {
    if (busy) return;
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}/contests/${contestId}/boxes/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
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
                <span className={styles.confirmText}>Numbers are assigned randomly and <strong>permanently</strong> — this can&apos;t be redone. Draw now?</span>
                <div className={styles.confirmBtns}>
                  <button type="button" className={styles.action} disabled={!!busy} onClick={() => doAction("draw")}>Yes, draw numbers</button>
                  <button type="button" className={styles.actionGhost} onClick={() => setConfirmDraw(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" className={styles.action} disabled={!!busy} onClick={() => setConfirmDraw(true)}>Draw numbers</button>
                <button type="button" className={styles.actionGhost} disabled={!!busy} onClick={() => doAction("reopen_secondary")}>Reopen picks</button>
              </>
            )}
            {!full && !confirmDraw && <p className={styles.warn}>Only {claimed}/100 squares are claimed — unclaimed winning squares pay no one.</p>}
          </>
        )}
        {phase === "locked" && <button type="button" className={styles.actionGhost} disabled={!!busy} onClick={() => doAction("finalize")}>Mark final</button>}
        {err && <p className={styles.err}>{err}</p>}
      </div>

      {/* Game selector (which game's numbers to view) */}
      {games.length > 1 && (
        <div className={styles.tabs}>
          {games.map((x, i) => (
            <button key={x.id} type="button" className={styles.tab} data-on={i === sel || undefined} onClick={() => setSel(i)}>
              {x.label}
            </button>
          ))}
        </div>
      )}

      {g && (
        <>
          <p className={styles.gridNote}>
            {drawn ? "Numbers locked." : "Numbers hidden until the board is full and you draw."}
            {g.teamRow?.abbrev && g.teamCol?.abbrev ? ` Rows: ${g.teamRow.abbrev}, Cols: ${g.teamCol.abbrev}.` : ""}
          </p>
          <BoxesGrid grid={grid} teamRow={{ label: g.teamRow?.abbrev ?? "Rows" }} teamCol={{ label: g.teamCol?.abbrev ?? "Cols" }} />
        </>
      )}

      {/* Games status */}
      <div className={styles.gamesStatus}>
        {games.map((x) => (
          <div key={x.id} className={styles.gameRow}>
            <span className={styles.gameName}>{x.label}</span>
            <span className={styles.gameState} data-locked={x.locked || undefined}>{x.locked ? "numbers set" : "awaiting draw"}</span>
          </div>
        ))}
      </div>

      {(phase === "locked" || phase === "final") && (
        <div className={styles.payouts}>
          <div className={styles.payHeadRow}>
            <h2 className={styles.payTitle}>Pay out</h2>
            <span className={styles.paySub}>auto-scored from ESPN, paid by you</span>
          </div>
          {payouts.length === 0 ? (
            <p className={styles.payEmpty}>{anyScored ? "No winners yet." : "No scores in yet — check back once the games are underway."}</p>
          ) : (
            payouts.map((p) => (
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
      )}
    </div>
  );
}
