"use client";

import { useEffect } from "react";
import { lockScroll, unlockScroll } from "./scrollLock";
import styles from "./Modal.module.css";

/**
 * Reusable dialog shell for the v2 app — a titled overlay card for forms and
 * other content. (ConfirmModal is the yes/no variant; this is the general one.)
 * Escape + backdrop close, scroll lock, inherits theme CSS variables.
 */
export default function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Floats centered BELOW the card, over the backdrop (e.g. a save-status chip). */
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.stack}>
        <div className={styles.card} onClick={(e) => e.stopPropagation()}>
          <div className={styles.head}>
            <h2 className={styles.title}>{title}</h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className={styles.body}>{children}</div>
        </div>
        {footer && <div className={styles.below} onClick={(e) => e.stopPropagation()}>{footer}</div>}
      </div>
    </div>
  );
}
