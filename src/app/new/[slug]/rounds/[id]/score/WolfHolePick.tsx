"use client";

import { useState } from "react";
import styles from "./score.module.css";
import type { RoundGame } from "./SideGameStandings";
import { computeWolf, type WolfDecision } from "@/lib/v2/rounds/wolf";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Resolve a game's scores to the net or gross basis it's played on. */
function toScores(
  isNet: boolean,
  gross: Record<string, Record<number, number>>,
  strokesByPlayer: Record<string, Record<number, number>>,
): Record<string, Record<number, number>> {
  if (!isNet) return gross;
  const out: Record<string, Record<number, number>> = {};
  for (const pid in gross) {
    const m: Record<number, number> = {};
    for (const h in gross[pid]) {
      const strokes = strokesByPlayer[pid]?.[Number(h)] ?? 0;
      m[Number(h)] = gross[pid][Number(h)] - strokes;
    }
    out[pid] = m;
  }
  return out;
}

function decisionsOf(g: RoundGame): Record<number, WolfDecision> {
  const out: Record<number, WolfDecision> = {};
  for (const [k, v] of Object.entries(g.decisions ?? {})) {
    if (v?.lone) out[Number(k)] = { lone: true };
    else if (typeof v?.partner === "string") out[Number(k)] = { partner: v.partner };
  }
  return out;
}

/**
 * The Wolf's per-hole pick, shown at the top of the current hole on the live
 * scorer (#222). Derives who the Wolf is this hole (rotation / last-place on
 * 17–18), then lets anyone scoring record the choice: partner (tap a name) or
 * Lone Wolf. Tapping the active choice again clears it. The pick is stored in the
 * game's config and the standings recompute from it.
 */
export default function WolfHolePick({
  game,
  holeNumber,
  holeNumbers,
  gross,
  strokesByPlayer = {},
  playerNames,
  roundId,
  onGameSaved,
}: {
  game: RoundGame;
  holeNumber: number;
  holeNumbers: number[];
  gross: Record<string, Record<number, number>>;
  strokesByPlayer?: Record<string, Record<number, number>>;
  playerNames: Record<string, string>;
  roundId: string;
  onGameSaved: (g: RoundGame) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  const scores = toScores(game.is_net, gross, strokesByPlayer);
  const r = computeWolf(holeNumbers, scores, game.participant_ids, decisionsOf(game), holeNumbers.length === 18);
  const ph = r.perHole.find((x) => x.hole_number === holeNumber);
  if (!ph) return null;

  const wolfId = ph.wolf;
  const current = ph.decision;
  const isLone = !!current && "lone" in current;
  const partnerId = current && "partner" in current ? current.partner : null;
  const opponents = game.participant_ids.filter((id) => id !== wolfId);

  async function pick(choice: WolfDecision | null, key: string) {
    if (saving) return;
    setSaving(key);
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: { [holeNumber]: choice } }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.game) onGameSaved(d.game as RoundGame);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className={styles.wolfStrip} data-need={!current || undefined}>
      <div className={styles.wolfStripHead}>
        <span className={styles.wolfBadge}>Wolf</span>
        <span className={styles.wolfWho}>{firstName(playerNames[wolfId] || "Player")} picks</span>
        {!current && <span className={styles.wolfNeed}>needs a pick</span>}
      </div>
      <div className={styles.wolfPicks}>
        {opponents.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.wolfPick}
            data-on={partnerId === id || undefined}
            disabled={!!saving}
            onClick={() => pick(partnerId === id ? null : { partner: id }, id)}
          >
            {firstName(playerNames[id] || "Player")}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.wolfPick} ${styles.wolfLone}`}
          data-on={isLone || undefined}
          disabled={!!saving}
          onClick={() => pick(isLone ? null : { lone: true }, "lone")}
        >
          Lone Wolf
        </button>
      </div>
    </div>
  );
}
