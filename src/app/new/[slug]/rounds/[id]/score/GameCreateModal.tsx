"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./score.module.css";
import type { RoundGame } from "./SideGameStandings";
import { formatStake, parseStake } from "@/lib/v2/rounds/stake";

type GameType = "skins" | "nassau" | "sixes" | "vegas";
const EXACT: Record<GameType, number | null> = { skins: null, nassau: 2, sixes: 4, vegas: 4 };
const UNIT: Record<GameType, string> = { skins: "skin", nassau: "bet", sixes: "segment", vegas: "pt" };
const LABEL: Record<GameType, string> = { skins: "Skins", nassau: "Nassau", sixes: "6-6-6", vegas: "Vegas" };
const DEFAULT_STAKE: Record<GameType, number> = { skins: 2, nassau: 5, sixes: 5, vegas: 0.1 };

/**
 * Add a side game to a round already in progress (#183) — the "Add game" button
 * on the live scorer. Type picker + gross/net + stake + roster, then POST.
 */
export default function GameCreateModal({
  playerNames,
  rosterOrder,
  roundId,
  brandColor = "#0a5c36",
  games,
  allowSixes,
  onCreated,
  onClose,
}: {
  playerNames: Record<string, string>;
  rosterOrder: string[];
  roundId: string;
  brandColor?: string;
  games: RoundGame[];
  allowSixes: boolean; // 18 holes + at least four players
  onCreated: (g: RoundGame) => void;
  onClose: () => void;
}) {
  // A round holds one Skins pot and one 6-6-6; Nassau can stack (one per pair).
  // A game also needs enough players (2, or 4 for 6-6-6 on 18 holes).
  const hasSkins = games.some((g) => g.game_type === "skins");
  const hasSixes = games.some((g) => g.game_type === "sixes");
  const hasVegas = games.some((g) => g.game_type === "vegas");
  const rosterCount = rosterOrder.length;
  const available = (["skins", "nassau", "sixes", "vegas"] as GameType[]).filter((t) =>
    t === "skins"
      ? !hasSkins && rosterCount >= 2
      : t === "nassau"
        ? rosterCount >= 2
        : t === "sixes"
          ? !hasSixes && allowSixes
          : !hasVegas && rosterCount >= 4, // vegas: 2v2, any hole count
  );
  const firstAvailable = available[0] ?? "nassau";

  const [type, setType] = useState<GameType>(firstAvailable);
  const [isNet, setIsNet] = useState(false);
  const [carry, setCarry] = useState(false); // skins: roll tied skins forward (default off)
  const [value, setValue] = useState<number | null>(DEFAULT_STAKE[firstAvailable]);
  const [valueStr, setValueStr] = useState(formatStake(DEFAULT_STAKE[firstAvailable]));
  const defaultFor = useMemo(
    () => (t: GameType) =>
      t === "skins" ? [...rosterOrder] : t === "vegas" ? [] : rosterOrder.slice(0, EXACT[t] ?? rosterOrder.length),
    [rosterOrder],
  );
  const [selected, setSelected] = useState<string[]>(defaultFor(firstAvailable));
  const [saving, setSaving] = useState(false);
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

  const pickType = (t: GameType) => {
    setType(t);
    setSelected(defaultFor(t)); // reset roster to a sensible default for the new type
    setValue(DEFAULT_STAKE[t]); // and its default stake
    setValueStr(formatStake(DEFAULT_STAKE[t]));
  };

  const exact = EXACT[type];
  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (exact != null && prev.length >= exact) return prev;
      return [...prev, id];
    });
  };

  const enough = exact != null ? selected.length === exact : selected.length >= 2;

  async function save() {
    if (!enough || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/games`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game_type: type,
          is_net: isNet,
          value: value && value > 0 ? value : null,
          carry: type === "skins" ? carry : undefined,
          participant_ids: selected,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "Could not add the game.");
        setSaving(false);
        return;
      }
      onCreated(d.game as RoundGame);
    } catch {
      setErr("Something went wrong.");
      setSaving(false);
    }
  }

  return createPortal(
    <div className={styles.gsOverlay} style={{ ["--brand" as string]: brandColor }} onClick={onClose}>
      <div className={styles.gsModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.gsHead}>
          <span className={styles.gsTitle}>Add a game</span>
          <button type="button" className={styles.gsClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <label className={styles.gsLabel}>Game</label>
        {available.length === 0 ? (
          <p className={styles.gsOptional}>No other games can be added to this round.</p>
        ) : (
          <div className={styles.gsSeg} role="group" aria-label="Game type">
            {available.map((t) => (
              <button key={t} type="button" className={styles.gsSegOption} data-on={type === t || undefined} onClick={() => pickType(t)}>
                {LABEL[t]}
              </button>
            ))}
          </div>
        )}

        <label className={styles.gsLabel}>Scoring</label>
        <div className={styles.gsSeg} role="group" aria-label="Gross or Net">
          <button type="button" className={styles.gsSegOption} data-on={!isNet || undefined} onClick={() => setIsNet(false)}>Gross</button>
          <button type="button" className={styles.gsSegOption} data-on={isNet || undefined} onClick={() => setIsNet(true)}>Net</button>
        </div>

        {type === "skins" && (
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
          <span className={styles.gsStakeUnit}>per {UNIT[type]}</span>
        </div>

        <label className={styles.gsLabel}>
          Players{" "}
          <span className={styles.gsOptional}>
            {type === "vegas" ? "tap 4 — first two are one team, next two the other" : exact != null ? `pick ${exact}` : "2 or more"}
          </span>
        </label>
        <div className={styles.gsPlayers}>
          {rosterOrder.map((id) => {
            const idx = selected.indexOf(id);
            const on = idx >= 0;
            const locked = exact != null && !on && selected.length >= exact;
            // Vegas colours the two teams by pick order (first two vs last two).
            const team = type === "vegas" && on ? (idx < 2 ? "a" : "b") : undefined;
            return (
              <button
                key={id}
                type="button"
                className={styles.gsChip}
                data-on={on && type !== "vegas" ? true : undefined}
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
          <span />
          <div className={styles.gsActionsRight}>
            <button type="button" className={styles.gsCancel} onClick={onClose}>Cancel</button>
            <button type="button" className={styles.gsSave} onClick={save} disabled={!enough || saving}>
              {saving ? "Adding…" : "Add game"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
