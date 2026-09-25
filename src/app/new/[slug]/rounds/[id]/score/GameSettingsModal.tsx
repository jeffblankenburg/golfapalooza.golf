"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./score.module.css";
import type { RoundGame } from "./SideGameStandings";
import { formatStake, parseStake } from "@/lib/v2/rounds/stake";

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
  const isSixes = game.game_type === "sixes";
  const isVegas = game.game_type === "vegas";
  const isSkins = game.game_type === "skins";
  const exact = isNassau ? 2 : isSixes || isVegas ? 4 : null; // fixed roster size, or any 2+
  const gameName = isNassau ? "Nassau" : isSixes ? "6-6-6" : isVegas ? "Vegas" : "Skins";
  const stakeUnit = isNassau ? "bet" : isSixes ? "segment" : isVegas ? "pt" : "skin";
  const [isNet, setIsNet] = useState(game.is_net);
  const [carry, setCarry] = useState(game.carry === true);
  const [value, setValue] = useState<number | null>(game.value);
  const [valueStr, setValueStr] = useState(formatStake(game.value));
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
      if (exact != null && prev.length >= exact) return prev; // fixed-roster cap
      return [...prev, id];
    });
  };

  const enough = exact != null ? selected.length === exact : selected.length >= 2;

  async function save() {
    if (!enough || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_net: isNet, value: value && value > 0 ? value : null, carry: isSkins ? carry : undefined, participant_ids: selected }),
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
          <span className={styles.gsTitle}>{gameName} settings</span>
          <button type="button" className={styles.gsClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <label className={styles.gsLabel}>Scoring</label>
        <div className={styles.gsSeg} role="group" aria-label="Gross or Net">
          <button type="button" className={styles.gsSegOption} data-on={!isNet || undefined} onClick={() => setIsNet(false)}>Gross</button>
          <button type="button" className={styles.gsSegOption} data-on={isNet || undefined} onClick={() => setIsNet(true)}>Net</button>
        </div>

        {isSkins && (
          <>
            <label className={styles.gsLabel}>Tied holes</label>
            <div className={styles.gsSeg} role="group" aria-label="Skins carryover">
              <button type="button" className={styles.gsSegOption} data-on={!carry || undefined} onClick={() => setCarry(false)}>No carry</button>
              <button type="button" className={styles.gsSegOption} data-on={carry || undefined} onClick={() => setCarry(true)}>Carry over</button>
            </div>
          </>
        )}

        <label className={styles.gsLabel}>Stake <span className={styles.gsOptional}>optional</span></label>
        <div className={styles.gsStake}>
          <span aria-hidden>$</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={valueStr}
            onChange={(e) => {
              setValueStr(e.target.value);
              setValue(parseStake(e.target.value));
            }}
            onBlur={() => setValueStr(formatStake(value))}
          />
          <span className={styles.gsStakeUnit}>per {stakeUnit}</span>
        </div>

        <label className={styles.gsLabel}>
          Players{" "}
          <span className={styles.gsOptional}>
            {isVegas ? "pick 4 — first two vs last two" : exact != null ? `pick ${exact}` : "2 or more"}
          </span>
        </label>
        <div className={styles.gsPlayers}>
          {rosterOrder.map((id) => {
            const idx = selected.indexOf(id);
            const on = idx >= 0;
            const locked = exact != null && !on && selected.length >= exact;
            // Vegas colours the two teams by pick order (first two vs last two).
            const team = isVegas && on ? (idx < 2 ? "a" : "b") : undefined;
            return (
              <button
                key={id}
                type="button"
                className={styles.gsChip}
                data-on={on && !isVegas ? true : undefined}
                data-team={team}
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
