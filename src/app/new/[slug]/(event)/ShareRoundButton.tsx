"use client";

import { useState } from "react";
import styles from "@/app/new/new.module.css";

/**
 * Share a round's group scorecard PNG (#204). Fetches the on-demand card image and
 * hands it to the native share sheet (Web Share API) so the golfer distributes it
 * themselves. Desktop / unsupported browsers fall back to opening the PNG.
 */
export default function ShareRoundButton({ roundId, courseName }: { roundId: string; courseName?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function share() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/card.png`);
      if (!res.ok) throw new Error("fetch");
      const blob = await res.blob();
      const file = new File([blob], "scorecard.png", { type: "image/png" });

      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: courseName ? `${courseName} — scorecard` : "Scorecard" });
      } else {
        // Fallback: open the image so it can be saved/copied.
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      }
    } catch (e) {
      // The user dismissing the share sheet throws AbortError — not a failure.
      if ((e as Error)?.name !== "AbortError") setErr("Couldn't create the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <button type="button" className={styles.roundShareBtn} onClick={share} disabled={busy}>
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
          <path d="M16 6l-4-4-4 4" />
          <path d="M12 2v13" />
        </svg>
        {busy ? "Preparing…" : "Share scorecard"}
      </button>
      {err && <span style={{ fontSize: "0.78rem", color: "#a3341f" }}>{err}</span>}
    </div>
  );
}
