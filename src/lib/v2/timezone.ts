/**
 * Timezone-aware instant math for events. An event carries an IANA timezone
 * (e.g. "America/New_York"); its `start_date` + `start_time` are a WALL-CLOCK time
 * in that zone. These helpers resolve the absolute UTC instant so a countdown is
 * identical for every viewer regardless of their own timezone, and count calendar
 * days in the event's zone so the "N days" figure matches the date on the calendar.
 *
 * Pure `Intl` — no dependency, works in server and client trees.
 */

/** Platform default when an event hasn't set one explicitly (schema default too). */
export const DEFAULT_TIMEZONE = "America/New_York";

/** Is this a valid IANA timezone the runtime understands? */
export function isValidTimeZone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The UTC epoch (ms) for a wall-clock date/time interpreted in `timeZone`.
 * `date` = "YYYY-MM-DD", `time` = "HH:MM" | "HH:MM:SS" (defaults to midnight).
 * Uses the standard offset-correction trick: guess the instant as if the wall
 * time were UTC, see what that instant reads as in the zone, and correct by the
 * difference. One pass is exact except on the ~1hr/yr DST "spring-forward" gap
 * (a wall time that doesn't exist), which is acceptable for an event start.
 */
export function wallTimeToUtcMs(date: string, time: string | null | undefined, timeZone: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h = 0, mi = 0, s = 0] = (time || "00:00:00").split(":").map(Number);
  const utcGuess = Date.UTC(y, (mo || 1) - 1, d || 1, h, mi, s);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcGuess))) parts[p.type] = p.value;
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24, // Intl can emit "24" for midnight in some runtimes
    Number(parts.minute),
    Number(parts.second),
  );
  const offset = asIfUtc - utcGuess; // the zone's offset from UTC at that instant
  return utcGuess - offset;
}

/**
 * Whole calendar days between "today in `timeZone`" and the event's start DATE
 * (also read in `timeZone`). Stable across the day — it doesn't shed a day as time
 * passes — so it matches the date on the calendar.
 */
export function calendarDaysUntil(nowMs: number, startDate: string, timeZone: string): number {
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs)); // "YYYY-MM-DD"
  const [ty, tm, td] = todayStr.split("-").map(Number);
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const todayMid = Date.UTC(ty, tm - 1, td);
  const startMid = Date.UTC(sy, sm - 1, sd);
  return Math.round((startMid - todayMid) / 86_400_000);
}

/** Short zone label for display at a given instant, e.g. "EDT". Best-effort. */
export function tzAbbrev(atMs: number, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date(atMs));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}
