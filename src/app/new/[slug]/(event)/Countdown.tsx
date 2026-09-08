"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";

/**
 * Live countdown to an event's start. Shows days when far out, and drops to
 * hours/minutes/seconds as it approaches. "Underway" once it starts. Renders
 * nothing until mounted (the server has no clock — avoids a hydration mismatch).
 */
export default function Countdown({
  start,
  end,
}: {
  start: string;
  end?: string | null;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const raf = requestAnimationFrame(tick); // first update off the effect body
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, []);

  if (now === null) return null;

  const startMs = new Date(start + "T00:00:00").getTime();
  const endMs = end ? new Date(end + "T23:59:59").getTime() : startMs;
  const diff = startMs - now;

  if (diff <= 0) {
    return (
      <span className={styles.countdown}>{now <= endMs ? "Underway" : "Complete"}</span>
    );
  }

  const s = Math.floor(diff / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  let text: string;
  if (days >= 1) text = `${days} day${days === 1 ? "" : "s"}`; // >1 day: days only
  else if (hours >= 1) text = `${hours}h ${mins}m`; // <24h: hours + minutes
  else text = `${mins}m ${secs}s`; // <1h: minutes + seconds

  return <span className={styles.countdown}>{text}</span>;
}
