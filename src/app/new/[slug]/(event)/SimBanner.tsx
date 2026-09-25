"use client";

import { useState } from "react";
import styles from "@/app/new/new.module.css";

/**
 * Persistent "you are simulating" banner. Always visible while the user and/or
 * time simulator is active so you never forget you're not seeing the real thing.
 * Floats above the bottom nav (below the nav's z so it never covers it). Exit
 * clears whichever sims are active.
 */
export default function SimBanner({ name, at }: { name: string | null; at: string | null }) {
  const [exiting, setExiting] = useState(false);

  async function exit() {
    if (exiting) return;
    setExiting(true);
    try {
      await Promise.all([
        name ? fetch("/api/v2/sim", { method: "DELETE" }) : Promise.resolve(),
        at ? fetch("/api/v2/sim/time", { method: "DELETE" }) : Promise.resolve(),
      ]);
    } catch {
      // ignore — reload anyway
    }
    window.location.reload();
  }

  return (
    <div className={styles.simBanner} role="status">
      <span className={styles.simBannerText}>
        {name && (
          <>
            <span aria-hidden>👁</span> Viewing as <strong>{name}</strong>
          </>
        )}
        {name && at && <span className={styles.simBannerSep} />}
        {at && (
          <>
            <span aria-hidden>🕐</span> <strong>{new Date(at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</strong>
          </>
        )}
      </span>
      <button type="button" className={styles.simBannerExit} onClick={exit} disabled={exiting}>
        {exiting ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
