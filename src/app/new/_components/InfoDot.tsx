"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A small "(i)" circle next to a title/label that reveals a short explanation on
 * tap. Tap again, click outside, scroll, or press Escape to dismiss. Inline popover
 * (not a full modal) — for a sentence or two of context, not long help.
 *
 * The popover is positioned with fixed coords clamped to the viewport, so it never
 * runs off-screen no matter where the dot sits (e.g. at the end of a long title).
 */
export default function InfoDot({ children, ariaLabel = "More info" }: { children: ReactNode; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(300, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(margin, r.left), window.innerWidth - width - margin);
    setPos({ top: r.bottom + 8, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place]);

  return (
    <span style={{ display: "inline-flex", flex: "none" }}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: 22, height: 22, borderRadius: "50%", padding: 0, cursor: "pointer",
          border: "1px solid var(--line-strong)", background: "var(--card, #fff)", color: "var(--ink-soft)",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div
            role="dialog"
            style={{
              position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 41,
              background: "var(--card, #fff)", border: "1px solid var(--line)", borderRadius: 12,
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 14,
              fontSize: "0.82rem", lineHeight: 1.5, fontWeight: 400, color: "var(--ink)", textAlign: "left",
            }}
          >
            {children}
          </div>
        </>
      )}
    </span>
  );
}
