export const US_TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];

/**
 * Convert a naive datetime string (from datetime-local input) to a UTC ISO string,
 * treating the naive datetime as being in the given IANA timezone.
 *
 * e.g. naiveDatetimeToUTC("2026-09-02T16:30", "America/New_York") → "2026-09-02T20:30:00.000Z"
 */
export function naiveDatetimeToUTC(naiveDatetime: string, timezone: string): string {
  if (!naiveDatetime || !naiveDatetime.includes("T")) {
    return new Date().toISOString();
  }

  // Parse the naive datetime parts
  const [datePart, timePart] = naiveDatetime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  // Create a date in UTC with the same wall clock values
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Use Intl to find the offset of the target timezone at this approximate time
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(utcGuess);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0");

  const tzYear = get("year");
  const tzMonth = get("month");
  const tzDay = get("day");
  const tzHour = get("hour") === 24 ? 0 : get("hour");
  const tzMinute = get("minute");

  // The offset is: what UTC time becomes in the timezone
  // offset_ms = (tz wall clock from UTC input) - (UTC input)
  const tzAsUTC = Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMinute);
  const offsetMs = tzAsUTC - utcGuess.getTime();

  // The actual UTC time = naive wall clock - offset
  const actualUTC = new Date(utcGuess.getTime() - offsetMs);

  return actualUTC.toISOString();
}

/**
 * Format a UTC ISO string in the given timezone.
 */
export function formatInTimezone(
  utcISO: string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = new Date(utcISO);
  return date.toLocaleString("en-US", { timeZone: timezone, ...options });
}

/**
 * Get the timezone abbreviation (e.g. "EDT", "EST") for a given timezone at a given date.
 */
export function getTimezoneAbbreviation(timezone: string, date?: Date): string {
  const d = date || new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(d);
  return parts.find((p) => p.type === "timeZoneName")?.value || timezone;
}
