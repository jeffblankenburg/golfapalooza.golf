"use client";

import { useEffect, useRef, useState } from "react";

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
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column" }}>
      {items.map((a, i) => (
        <article
          key={a.id}
          data-aid={a.id}
          style={{
            padding: "16px 0",
            borderTop: i === 0 ? "none" : "1px solid var(--line)",
            transition: "background-color 0.3s ease",
            ...(flash === a.id ? { backgroundColor: "rgba(10, 92, 54, 0.08)" } : {}),
          }}
        >
          <h2 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 700, color: "var(--ink)", lineHeight: 1.3 }}>
            {a.title}
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "0.66rem", color: "var(--ink-soft)" }}>{a.dateText}</p>
          {a.body && (
            <p style={{ margin: "8px 0 0", fontSize: "0.82rem", whiteSpace: "pre-wrap", lineHeight: 1.5, color: "var(--ink)" }}>
              {a.body}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
