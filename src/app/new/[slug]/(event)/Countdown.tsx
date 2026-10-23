"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";
import { wallTimeToUtcMs, calendarDaysUntil, DEFAULT_TIMEZONE } from "@/lib/v2/timezone";

/**
 * Live countdown to an event's start. Shows days when far out, and drops to
 * hours/minutes/seconds as it approaches. "Underway" once it starts. Renders
 * nothing until mounted (the server has no clock — avoids a hydration mismatch).
 *
 * `nowMs` is the server's EFFECTIVE now (honors the time simulator). We tick off
 * the browser clock but apply the sim offset so the countdown reflects the
 * simulated time when active, and normal time otherwise.
 */
export default function Countdown({
  start,
  startTime,
  end,
  nowMs,
  timeZone,
}: {
  start: string;
  /** Optional start-of-day time ("HH:MM"/"HH:MM:SS"). Falls back to midnight. */
  startTime?: string | null;
  end?: string | null;
  nowMs: number;
  /** The event's IANA timezone — the wall-clock start is resolved in it. */
  timeZone?: string | null;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const offset = nowMs - Date.now(); // simulated-now minus real-now (≈0 when not simulating)
    const tick = () => setNow(Date.now() + offset);
    const raf = requestAnimationFrame(tick); // first update off the effect body
    const id = setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [nowMs]);

  if (now === null) return null;

  // Resolve the absolute start instant from the event's wall-clock time in ITS
  // timezone, so the countdown is the same for every viewer. A set start time
  // targets the real kickoff (e.g. first tee); otherwise midnight of the day.
  const tz = timeZone || DEFAULT_TIMEZONE;
  const startMs = wallTimeToUtcMs(start, startTime, tz);
  const endMs = wallTimeToUtcMs(end || start, "23:59:59", tz);
  const diff = startMs - now;

  if (diff <= 0) {
    return (
      <span className={styles.countdown}>{now <= endMs ? "Underway" : "Complete"}</span>
    );
  }

  let text: string;
  if (diff < 86_400_000) {
    // Final 24h before the start — drop to a live hours/minutes/seconds readout.
    const s = Math.floor(diff / 1000);
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    text = hours >= 1 ? `${hours}h ${mins}m` : `${mins}m ${secs}s`;
  } else {
    // Further out: whole CALENDAR days counted in the event's zone, so the figure
    // matches the date on the calendar and doesn't shed a day as time passes.
    const days = calendarDaysUntil(now, start, tz);
    text = `${days} day${days === 1 ? "" : "s"}`;
  }

  return <span className={styles.countdown}>{text}</span>;
}
