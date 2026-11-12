"use client";

import { useEffect, useState } from "react";
import { readPendingGroup, clearPendingGroup, type PendingGroup } from "@/lib/v2/pending-group";
import styles from "./loading.module.css";
/* eslint-disable @next/next/no-img-element */

/**
 * Instant loading fallback for everything under /new. On a group switch the
 * [slug] + event layouts and home page re-render server-side (several DB round
 * trips), which otherwise leaves the screen blank for a beat. Boundary lives here
 * (above [slug]) so it covers the slow layouts, not just the page.
 *
 * The switcher stashes the destination group's branding right before navigating
 * (this boundary can't see the target route's params), so we greet the switch with
 * the destination logo instead of a bare spinner. The read is pure (StrictMode
 * double-invokes the initializer); the one-shot clear happens in an effect.
 */
export default function NewLoading() {
  const [pending] = useState<PendingGroup | null>(() => readPendingGroup());

  useEffect(() => {
    clearPendingGroup();
  }, []);

  return (
    <div className={styles.wrap} role="status" aria-label="Loading">
      {pending ? (
        <div className={styles.dest}>
          <div className={styles.destLogo}>
            {pending.logoUrl ? (
              <img src={pending.logoUrl} alt="" />
            ) : (
              <span className={styles.destMono}>{pending.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className={styles.destName}>{pending.name}</span>
          <div className={styles.spinner} />
        </div>
      ) : (
        <div className={styles.spinner} />
      )}
    </div>
  );
}
