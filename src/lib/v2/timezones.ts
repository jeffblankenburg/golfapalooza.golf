/**
 * Shared IANA timezone list + detection for the admin pickers (event timezone and
 * the org "home" timezone). Static and client-safe — identical on server and client.
 * Falls back to common US zones + UTC on runtimes without `Intl.supportedValuesOf`.
 */
export const TIME_ZONES: string[] = (() => {
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    const list = sv?.("timeZone");
    if (Array.isArray(list) && list.length) return list;
  } catch {
    /* fall through */
  }
  return [
    "America/New_York", "America/Chicago", "America/Denver", "America/Phoenix",
    "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu", "UTC",
  ];
})();

/** The current runtime's zone — a sensible default for a new event/org. */
export function detectTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}
