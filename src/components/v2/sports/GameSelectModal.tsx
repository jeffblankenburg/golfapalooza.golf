"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import styles from "./GameSelectModal.module.css";
import GamePicker from "./GamePicker";
import type { EspnGame } from "@/lib/v2/sports/espn";

/**
 * Focused ESPN game browser (#230) — a modal around <GamePicker>. Decouples
 * "find games" from "configure the contest": the owning form shows the selected
 * games, this modal does the browsing. Selection is live (onChange), so Done just
 * closes. Reusable by any sports contest (Squares, bracket, pick'em…).
 */
export default function GameSelectModal({
  value,
  onChange,
  onClose,
  initialLeague,
  initialDate,
  mode = "multi",
}: {
  value: EspnGame[];
  onChange: (games: EspnGame[]) => void;
  onClose: () => void;
  initialLeague?: string;
  initialDate?: string;
  mode?: "single" | "multi";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <span className={styles.title}>Add games</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <p className={styles.hint}>Switch leagues to mix sports — your picks carry across.</p>
        <GamePicker mode={mode} value={value} onChange={onChange} initialLeague={initialLeague} initialDate={initialDate} />
        <button type="button" className={styles.done} onClick={onClose}>
          Done{value.length ? ` (${value.length} selected)` : ""}
        </button>
      </div>
    </div>,
    document.body,
  );
}
