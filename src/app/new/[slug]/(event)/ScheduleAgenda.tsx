"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { fmtTime, fmtDateShort, daysBetween, addDaysYMD, type CalendarEntry } from "@/lib/v2/schedule";
import EventLocation from "./EventLocation";
import styles from "@/app/new/new.module.css";

// Mirrors the composer's PAST_WINDOW_DAYS so an event span that begins before the
// visible window doesn't expand into off-window days.
const PAST_WINDOW_DAYS = 30;

function headerLabel(ymd: string, today: string): string {
  const d = new Date(ymd + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** Within a day: all-day first (event banner, then birthday), then timed by start. */
function sortDay(items: CalendarEntry[]): CalendarEntry[] {
  return [...items].sort(
    (a, b) =>
      Number(b.all_day) - Number(a.all_day) ||
      a.sort_order - b.sort_order ||
      (a.start_time || "99").localeCompare(b.start_time || "99"),
  );
}

/**
 * Read-only merged member calendar (#208) — one seamless Apple-Calendar List view
 * over every source (group items, active-event items, event spans, birthdays,
 * activity times). Date headers with entries grouped beneath, chronological,
 * opening at the next upcoming day with past days scrollable above. No day tabs.
 *
 * Multi-day EVENTS follow Apple Calendar: the event shows as an all-day entry at
 * the top of every day it spans (the composer sends one canonical span; we expand
 * it here for display, leaving the iCal feed's single multi-day VEVENT untouched).
 */
export default function ScheduleAgenda({ entries, today }: { entries: CalendarEntry[]; today: string }) {
  const groups = useMemo(() => {
    const floor = addDaysYMD(today, -PAST_WINDOW_DAYS);
    const byDay = new Map<string, CalendarEntry[]>();
    const add = (day: string, e: CalendarEntry) => (byDay.get(day) || byDay.set(day, []).get(day)!).push(e);
    for (const e of entries) {
      if (e.source === "event-span") {
        // Repeat the event at the top of each day it covers (Apple-style), clamped
        // to the visible window; drop the range meta since it's now per-day.
        const start = e.day < floor ? floor : e.day;
        for (const day of daysBetween(start, e.end_day || e.day)) {
          add(day, { ...e, id: `${e.id}:${day}`, day, end_day: null });
        }
      } else {
        add(e.day, e);
      }
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, its]) => ({ day, items: sortDay(its) }));
  }, [entries, today]);

  const upcomingIdx = useMemo(() => groups.findIndex((g) => g.day >= today), [groups, today]);
  const upcomingDay = upcomingIdx > 0 ? groups[upcomingIdx].day : null;
  const nextRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !upcomingDay || !nextRef.current) return;
    scrolled.current = true;
    nextRef.current.scrollIntoView({ block: "start" });
  }, [upcomingDay]);

  if (groups.length === 0) return <p className={styles.dnsHint}>Nothing scheduled yet.</p>;

  return (
    <div className={styles.schedGroups}>
      {groups.map((g) => (
        <div key={g.day} className={styles.schedGroup} ref={g.day === upcomingDay ? nextRef : null}>
          <div className={styles.schedDateHead}>
            {headerLabel(g.day, today)}
            {g.day === today && <span className={styles.schedToday}>Today</span>}
          </div>
          <div className={styles.schedList}>
            {g.items.map((it) => {
              const body = (
                <>
                  <span className={styles.schedTime}>{it.all_day ? "All day" : fmtTime(it.start_time) || "—"}</span>
                  <span className={styles.schedItemMain}>
                    <span className={styles.schedItemTitle}>{it.title}</span>
                    {it.end_day && it.end_day !== it.day && (
                      <span className={styles.schedItemMeta}>
                        {fmtDateShort(it.day)} – {fmtDateShort(it.end_day)}
                      </span>
                    )}
                    {it.location && (
                      <span className={`${styles.schedItemMeta} ${styles.schedItemLoc}`}>
                        <EventLocation location={it.location} />
                      </span>
                    )}
                    {it.description && (
                      <span className={`${styles.schedItemMeta} ${styles.schedItemDesc}`}>{it.description}</span>
                    )}
                  </span>
                </>
              );
              return it.href ? (
                <Link key={it.id} href={it.href} className={styles.schedItem} data-source={it.source}>
                  {body}
                </Link>
              ) : (
                <div key={it.id} className={styles.schedItem} data-source={it.source} style={{ cursor: "default" }}>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
