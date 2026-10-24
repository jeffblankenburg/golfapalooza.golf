"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { getLeague } from "@/lib/v2/sports/espn";
import { PERIOD_PRESETS } from "@/lib/v2/contests/squares";
import {
  AllocInput, defaultGameAlloc, defaultPeriodAlloc, editorToStored, storedToEditor,
  type EditorAlloc, type Structure,
} from "../SquaresEditor";
import squareStyles from "../SquaresAdmin.module.css";
import type { ManageGame } from "./SquaresManage";

/**
 * Per-game management modal (opened from a game's gear on the detail page): set this
 * game's payout allocation (its cut of the pot + the per-period split) and delete it
 * if it hasn't happened yet. Saves via the squares/action route.
 */
export default function SquaresGamePayoutModal({
  game,
  base,
  onClose,
}: {
  game: ManageGame;
  base: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const periods = getLeague(game.league)?.periods;
  const structure: Structure | null = periods === "quarters" || periods === "halves" ? periods : null;

  const [galloc, setGalloc] = useState<EditorAlloc>(storedToEditor(game.gameAlloc) ?? defaultGameAlloc());
  const [palloc, setPalloc] = useState<Record<string, EditorAlloc>>(() => {
    if (!structure) return {};
    const seed = defaultPeriodAlloc(structure);
    const out: Record<string, EditorAlloc> = {};
    for (const p of PERIOD_PRESETS[structure]) out[p.key] = storedToEditor(game.periodAlloc?.[p.key]) ?? seed[p.key];
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // Only games that haven't started / drawn numbers can be deleted.
  const canDelete = !game.locked && !game.final && (!game.startTime || new Date(game.startTime).getTime() > Date.now());

  async function act(payload: Record<string, unknown>) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}/squares/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Something went wrong."); setBusy(false); return false; }
      router.refresh();
      return true;
    } catch { setErr("Something went wrong."); setBusy(false); return false; }
  }

  async function save() {
    const periodAlloc = structure
      ? Object.fromEntries(PERIOD_PRESETS[structure].map((p) => [p.key, editorToStored(palloc[p.key] ?? defaultPeriodAlloc(structure)[p.key])]))
      : null;
    if (await act({ action: "update_game_payout", gameId: game.id, gameAlloc: editorToStored(galloc), periodAlloc })) onClose();
  }

  async function del() {
    if (await act({ action: "delete_game", gameId: game.id })) onClose();
  }

  return (
    <Modal open title={game.label} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>Game pays</span>
          <AllocInput alloc={galloc} onChange={setGalloc} allowRemainder />
          <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--ink-soft)" }}>Its cut of the pot, as a $ amount, a % of the pot, or &ldquo;the rest&rdquo;.</p>
        </div>

        {structure && (
          <div>
            <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 6 }}>Period split</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {PERIOD_PRESETS[structure].map((p) => (
                <div key={p.key} className={squareStyles.payPeriodRow}>
                  <span className={squareStyles.payPeriodName}>{p.label}</span>
                  <AllocInput
                    compact
                    alloc={palloc[p.key] ?? defaultPeriodAlloc(structure)[p.key]}
                    onChange={(a) => setPalloc((prev) => ({ ...prev, [p.key]: a }))}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {err && <p style={{ margin: 0, color: "var(--danger, #c2410c)", fontSize: "0.85rem" }}>{err}</p>}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {canDelete && (confirmDel ? (
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <button type="button" className={squareStyles.delConfirm} disabled={busy} onClick={del}>Delete?</button>
              <button type="button" className={squareStyles.cancel} onClick={() => setConfirmDel(false)}>No</button>
            </span>
          ) : (
            <button type="button" className={squareStyles.delBtn} onClick={() => setConfirmDel(true)}>Delete game</button>
          ))}
          <button type="button" className={squareStyles.create} style={{ marginLeft: "auto" }} disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save payouts"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
