"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./GameRulesModal.module.css";
import { GAME_RULES } from "@/lib/v2/rounds/game-rules";

/**
 * Plain-language rules for a side game (#222), shown anywhere a game appears. Use
 * <GameRulesInfoButton gameType="wolf" /> to drop a circle-i that opens the modal;
 * the modal itself is exported for custom triggers.
 */
export function GameRulesModal({ gameType, onClose }: { gameType: string; onClose: () => void }) {
  const rules = GAME_RULES[gameType];

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

  if (!rules) return null;

  return createPortal(
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-label={`${rules.label} rules`}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div className={styles.titleWrap}>
            <span className={styles.title}>{rules.label}</span>
            <span className={styles.tagline}>{rules.tagline}</span>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <span className={styles.players}>{rules.players}</span>
        {rules.sections.map((s) => (
          <div key={s.heading} className={styles.section}>
            <div className={styles.sectionHeading}>{s.heading}</div>
            <ul className={styles.list}>
              {s.points.map((p, i) => (
                <li key={i} className={styles.item}>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

/**
 * The circle-i trigger + its modal. Drop it wherever a game is shown. Stops click
 * propagation so it works inside clickable rows/cards without triggering them.
 */
export function GameRulesInfoButton({ gameType, className }: { gameType: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!GAME_RULES[gameType]) return null;
  return (
    <>
      <button
        type="button"
        className={className ?? styles.infoBtn}
        aria-label="Game rules"
        title="Rules"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>
      {open && <GameRulesModal gameType={gameType} onClose={() => setOpen(false)} />}
    </>
  );
}
