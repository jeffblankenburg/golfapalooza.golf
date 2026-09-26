"use client";

import styles from "@/app/new/new.module.css";

/**
 * "Add to your calendar" for the whole merged group schedule (#208) — a single
 * calendar-plus icon that opens the device's calendar-subscribe flow via a
 * webcal:// URL (auto-updating). Backed by the public org iCal feed at
 * /api/v2/ical/org/[orgId] (schedule items + event spans; birthdays excluded for privacy).
 */
export default function ScheduleSubscribe({ orgId }: { orgId: string }) {
  function subscribe() {
    window.location.href = `webcal://${window.location.host}/api/v2/ical/org/${orgId}`;
  }

  return (
    <button type="button" className={styles.schedSubIcon} onClick={subscribe} aria-label="Add to calendar" title="Add to calendar">
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
        <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
        <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
        <path d="M12 13v5M9.5 15.5h5" />
      </svg>
    </button>
  );
}
