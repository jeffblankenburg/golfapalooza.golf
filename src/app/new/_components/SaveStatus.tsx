"use client";

import styles from "./SaveStatus.module.css";
import type { SaveState } from "./useAutoSave";

/**
 * Sticky, floating save indicator — the app-wide "is my data safe?" chip
 * ([[feedback_autosave_everywhere]]). Pairs with useAutoSave. `variant="page"`
 * pins above the bottom nav; `variant="modal"` floats at the bottom of a modal body.
 */
export default function SaveStatus({
  state,
  error,
  onRetry,
  variant = "page",
  idleLabel = "Changes save automatically",
  savedLabel = "All changes saved",
}: {
  state: SaveState;
  error?: string | null;
  onRetry?: () => void;
  variant?: "page" | "modal";
  idleLabel?: string;
  savedLabel?: string;
}) {
  return (
    <div className={variant === "modal" ? styles.modalBar : styles.bar}>
      <span className={styles.chip} data-state={state === "idle" ? undefined : state} aria-live="polite">
        {state === "saving" && (
          <>
            <svg className={styles.spin} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><path d="M12 3a9 9 0 1 0 9 9" /></svg>
            Saving…
          </>
        )}
        {state === "saved" && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
            {savedLabel}
          </>
        )}
        {state === "error" && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>
            {error || "Couldn't save"}
            {onRetry && <button type="button" className={styles.retry} onClick={onRetry}>Retry</button>}
          </>
        )}
        {state === "idle" && (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
            {idleLabel}
          </>
        )}
      </span>
    </div>
  );
}
