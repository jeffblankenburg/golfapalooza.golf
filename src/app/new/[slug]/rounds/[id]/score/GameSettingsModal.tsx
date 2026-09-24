"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./score.module.css";
import type { RoundGame } from "./SideGameStandings";

/**
 * Edit or remove a side game mid-round (#183) — stake, gross/net, and who's in.
 * Nassau is head-to-head (exactly two); Skins takes any two or more.
 */
export default function GameSettingsModal({
  game,
  playerNames,
  rosterOrder,
  roundId,
  brandColor = "#0a5c36",
  onSaved,
  onRemoved,
  onClose,
}: {
  game: RoundGame;
  playerNames: Record<string, string>;
  rosterOrder: string[]; // player ids in display order
  roundId: string;
  brandColor?: string;
  onSaved: (g: RoundGame) => void;
  onRemoved: (id: string) => void;
  onClose: () => void;
}) {
  const isNassau = game.game_type === "nassau";
  const [isNet, setIsNet] = useState(game.is_net);
  const [value, setValue] = useState<number | null>(game.value);
  const [selected, setSelected] = useState<string[]>(game.participant_ids);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (isNassau && prev.length >= 2) return prev; // head-to-head cap
      return [...prev, id];
    });
  };

  const enough = isNassau ? selected.length === 2 : selected.length >= 2;

  async function save() {
    if (!enough || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_net: isNet, value: value && value > 0 ? value : null, participant_ids: selected }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "Could not save.");
        setSaving(false);
        return;
      }
      onSaved(d.game as RoundGame);
    } catch {
      setErr("Something went wrong.");
      setSaving(false);
    }
  }

  async function remove() {
    if (removing) return;
    setRemoving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/games/${game.id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Could not remove.");
        setRemoving(false);
        return;
      }
      onRemoved(game.id);
    } catch {
      setErr("Something went wrong.");
      setRemoving(false);
    }
  }

  return createPortal(
    <div className={styles.gsOverlay} style={{ ["--brand" as string]: brandColor }} onClick={onClose}>
      <div className={styles.gsModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.gsHead}>
          <span className={styles.gsTitle}>{isNassau ? "Nassau" : "Skins"} settings</span>
          <button type="button" className={styles.gsClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <label className={styles.gsLabel}>Scoring</label>
        <div className={styles.gsSeg} role="group" aria-label="Gross or Net">
          <button type="button" className={styles.gsSegOption} data-on={!isNet || undefined} onClick={() => setIsNet(false)}>Gross</button>
          <button type="button" className={styles.gsSegOption} data-on={isNet || undefined} onClick={() => setIsNet(true)}>Net</button>
        </div>

        <label className={styles.gsLabel}>Stake <span className={styles.gsOptional}>optional</span></label>
        <div className={styles.gsStake}>
          <span aria-hidden>$</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            placeholder="0"
            value={value ?? ""}
            onChange={(e) => setValue(e.target.value === "" ? null : Math.max(0, Number(e.target.value)))}
          />
          <span className={styles.gsStakeUnit}>per {isNassau ? "bet" : "skin"}</span>
        </div>

        <label className={styles.gsLabel}>
          Players {isNassau ? <span className={styles.gsOptional}>pick 2</span> : <span className={styles.gsOptional}>2 or more</span>}
        </label>
        <div className={styles.gsPlayers}>
          {rosterOrder.map((id) => {
            const on = selected.includes(id);
            const locked = isNassau && !on && selected.length >= 2;
            return (
              <button
                key={id}
                type="button"
                className={styles.gsChip}
                data-on={on || undefined}
                disabled={locked}
                onClick={() => toggle(id)}
              >
                {playerNames[id] || "Player"}
              </button>
            );
          })}
        </div>

        {err && <p className={styles.gsErr}>{err}</p>}

        <div className={styles.gsActions}>
          <button type="button" className={styles.gsRemove} onClick={remove} disabled={removing}>
            {removing ? "Removing…" : "Remove game"}
          </button>
          <div className={styles.gsActionsRight}>
            <button type="button" className={styles.gsCancel} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.gsSave} onClick={save} disabled={!enough || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
