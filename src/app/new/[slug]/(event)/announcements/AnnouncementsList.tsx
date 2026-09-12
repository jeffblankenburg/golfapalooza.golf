"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/new/new.module.css";

export interface MemberAnnouncement {
  id: string;
  title: string;
  body: string | null;
  dateText: string;
}

/**
 * Member-facing announcement history. When arrived at via a notification tap
 * (?a=<id>), scroll that announcement into view and briefly highlight it so the
 * notification leads directly to its content.
 */
export default function AnnouncementsList({
  items,
  highlightId,
}: {
  items: MemberAnnouncement[];
  highlightId: string | null;
}) {
  const [flash, setFlash] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightId) return;
    let clearTimer: ReturnType<typeof setTimeout> | undefined;
    // Defer the scroll + setState out of the effect body (avoids the
    // set-state-in-effect / cascading-render lint), same pattern as EventShell.
    const raf = requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector(`[data-aid="${highlightId}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(highlightId);
      clearTimer = setTimeout(() => setFlash(null), 2200);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (clearTimer) clearTimeout(clearTimer);
    };
  }, [highlightId]);

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((a) => (
        <article
          key={a.id}
          data-aid={a.id}
          className={styles.card}
          style={
            flash === a.id
              ? { borderColor: "var(--brand)", boxShadow: "0 0 0 2px var(--brand)", transition: "box-shadow 0.3s ease, border-color 0.3s ease" }
              : undefined
          }
        >
          <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--ink)" }}>{a.title}</h2>
          <p style={{ margin: "4px 0 0", fontSize: "0.72rem", color: "var(--ink-soft)" }}>{a.dateText}</p>
          {a.body && (
            <p style={{ margin: "12px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--ink)" }}>{a.body}</p>
          )}
        </article>
      ))}
    </div>
  );
}
