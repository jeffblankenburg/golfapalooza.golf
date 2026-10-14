"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./BoxesPlay.module.css";
import BoxesGrid from "@/components/v2/contests/BoxesGrid";
import { cellKey, type BoxesGridState } from "@/lib/v2/contests/boxes";

export interface PlayGame {
  id: string;
  label: string;
  teamRow: { abbrev?: string } | null;
  teamCol: { abbrev?: string } | null;
  rowDigits: number[];
  colDigits: number[];
  locked: boolean;
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

const PHASE_NOTE: Record<string, string> = {
  setup: "The draft hasn't opened yet.",
  primary: "Primary draft — claim your squares (up to your limit).",
  secondary: "Secondary draft — grab as many open squares as you like.",
  closed: "Picks are closed. Numbers drop soon.",
  locked: "Numbers are set. Good luck!",
  final: "This pool is final.",
};

export default function BoxesPlay({
  orgId,
  contestId,
  name,
  phase,
  cellCostCents,
  maxPrimary,
  maxSecondary,
  games,
  owners,
  mine,
  claimed,
}: {
  orgId: string;
  slug: string;
  contestId: string;
  name: string;
  phase: string;
  cellCostCents: number;
  maxPrimary: number;
  maxSecondary: number | null;
  games: PlayGame[];
  owners: Record<string, string>;
  mine: string[];
  claimed: number;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mineSet = new Set(mine);
  const buyingOpen = phase === "primary" || phase === "secondary";
  const cap = phase === "primary" ? maxPrimary : maxSecondary;
  const atCap = cap != null && mine.length >= cap;

  const g = games[sel];
  const grid: BoxesGridState = { owners, rowDigits: g?.rowDigits ?? [], colDigits: g?.colDigits ?? [] };

  async function tap(row: number, col: number) {
    if (!buyingOpen || busy) return;
    const k = cellKey(row, col);
    const isMine = mineSet.has(k);
    const isOpen = !owners[k];
    if (!isMine && !isOpen) return; // someone else's square
    if (isOpen && atCap) {
      setErr(`You're at your limit of ${cap} for this round.`);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}/contests/${contestId}/boxes/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isMine ? "release" : "claim", row, col }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || "Could not update.");
      else router.refresh();
    } catch {
      setErr("Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{name}</h1>
      <p className={styles.note}>{PHASE_NOTE[phase] ?? ""}</p>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{claimed}/100</span>
          <span className={styles.statLabel}>claimed</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{mine.length}</span>
          <span className={styles.statLabel}>yours{cap != null ? ` / ${cap}` : ""}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{money(mine.length * cellCostCents)}</span>
          <span className={styles.statLabel}>you owe</span>
        </div>
      </div>

      {games.length > 1 && (
        <div className={styles.tabs}>
          {games.map((x, i) => (
            <button key={x.id} type="button" className={styles.tab} data-on={i === sel || undefined} onClick={() => setSel(i)}>
              {x.label}
            </button>
          ))}
        </div>
      )}

      {err && <p className={styles.err}>{err}</p>}

      {g && (
        <BoxesGrid
          grid={grid}
          teamRow={{ label: g.teamRow?.abbrev ?? "Away" }}
          teamCol={{ label: g.teamCol?.abbrev ?? "Home" }}
          mine={mineSet}
          onCellClick={buyingOpen ? tap : undefined}
        />
      )}

      {buyingOpen && <p className={styles.help}>Tap an open square to claim it. Tap one of yours (highlighted) to release it.</p>}
    </div>
  );
}
