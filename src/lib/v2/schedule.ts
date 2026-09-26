/** Shared schedule (#208) constants + helpers for the admin editor and member agenda. */

export type ScheduleKind = "activity" | "meal" | "watch" | "logistics" | "general";

export const SCHEDULE_KINDS: { key: ScheduleKind; label: string; icon: string }[] = [
  { key: "activity", label: "Activity", icon: "⛳" },
  { key: "meal", label: "Meal", icon: "🍽" },
  { key: "watch", label: "Watch", icon: "📺" },
  { key: "logistics", label: "Logistics", icon: "🚗" },
  { key: "general", label: "General", icon: "📌" },
];
export const KIND_ICON: Record<string, string> = Object.fromEntries(SCHEDULE_KINDS.map((k) => [k.key, k.icon]));

// Activity modules a slot can point at (built incrementally; slots work as placeholders meanwhile).
export const ACTIVITY_TYPES: { key: string; label: string }[] = [
  { key: "ryder_cup", label: "Ryder Cup" },
  { key: "scramble", label: "Scramble" },
  { key: "scramble_skins", label: "Scramble Skins" },
  { key: "calcutta", label: "Calcutta" },
  { key: "cornhole", label: "Cornhole" },
  { key: "skins", label: "Skins" },
  { key: "pickem", label: "Pick'em" },
  { key: "other", label: "Other" },
];
export const ACTIVITY_LABEL: Record<string, string> = Object.fromEntries(ACTIVITY_TYPES.map((a) => [a.key, a.label]));

const pad = (n: number) => String(n).padStart(2, "0");
export const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Inclusive list of YYYY-MM-DD from start..end (end defaults to start). */
export function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00");
  const e = new Date((end || start) + "T00:00:00");
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) out.push(toYMD(d));
  return out;
}

/**
 * Which day tab to open by default, given the sorted day list and today. Prefers
 * today, else the next upcoming day (a year-spanning schedule usually wants the
 * next thing), else the most recent past day.
 */
export function defaultDay(days: string[], today: string): string {
  if (days.includes(today)) return today;
  const upcoming = days.find((d) => d >= today);
  return upcoming || days[days.length - 1] || today;
}

/** "HH:MM(:SS)" → "8:00am"; empty for null. */
export function fmtTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)}${ap}`;
}

export interface ScheduleItem {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  day: string; // start date
  end_day: string | null; // optional end date (spans day..end_day inclusive)
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  sort_order: number;
  kind: ScheduleKind;
  activity_type: string | null;
  activity_id: string | null;
}

/** Does an item cover the given day (single-day, or within its start..end span)? */
export function itemSpansDay(item: { day: string; end_day: string | null }, ymd: string): boolean {
  return ymd >= item.day && ymd <= (item.end_day || item.day);
}

/** The tab days an item contributes (its start, plus its end when it spans). */
export function itemTabDays(item: { day: string; end_day: string | null }): string[] {
  return item.end_day && item.end_day !== item.day ? [item.day, item.end_day] : [item.day];
}

/** "Sep 3" style short date. */
export function fmtDateShort(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface ScheduleItemBody {
  title?: string;
  description?: string | null;
  location?: string | null;
  day?: string;
  end_day?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  all_day?: boolean;
  sort_order?: number;
  kind?: string;
  activity_type?: string | null;
}

const KIND_KEYS = SCHEDULE_KINDS.map((k) => k.key) as string[];

/** Validate + normalize an incoming item body into a DB patch, or return an error. */
export function normalizeScheduleItem(body: ScheduleItemBody): { error: string } | Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if ("title" in body) {
    const title = (body.title || "").trim();
    if (!title) return { error: "Title is required" };
    patch.title = title;
  }
  if ("description" in body) patch.description = body.description?.trim() || null;
  if ("location" in body) patch.location = body.location?.trim() || null;
  if ("day" in body) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day || "")) return { error: "A valid start date is required" };
    patch.day = body.day;
  }
  if ("end_day" in body) {
    const end = (body.end_day || "").trim();
    if (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) return { error: "Invalid end date" };
    // When both are present in this write, the end can't precede the start.
    if (end && "day" in body && body.day && end < body.day) return { error: "End date can't be before the start date" };
    patch.end_day = end || null;
  }
  if ("start_time" in body) patch.start_time = body.start_time || null;
  if ("end_time" in body) patch.end_time = body.end_time || null;
  if ("all_day" in body) patch.all_day = !!body.all_day;
  if ("sort_order" in body) patch.sort_order = Number.isFinite(body.sort_order) ? body.sort_order : 0;
  if ("kind" in body) {
    if (!KIND_KEYS.includes(body.kind || "")) return { error: "Invalid kind" };
    patch.kind = body.kind;
  }
  if ("activity_type" in body) patch.activity_type = body.activity_type?.trim() || null;
  return patch;
}

type SortableItem = { all_day: boolean; start_time: string | null; sort_order: number };

/** Sort within a day: all-day first, then by start time, then explicit order. */
export function sortDayItems<T extends SortableItem>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      Number(b.all_day) - Number(a.all_day) ||
      (a.start_time || "99").localeCompare(b.start_time || "99") ||
      a.sort_order - b.sort_order,
  );
}

// ── Merged member calendar (#208) ────────────────────────────────────────────
// The member "Schedule" is one seamless feed. Some entries are authored
// (v2_schedule_items), some are derived (event spans, birthdays, activity times).
// The API composes them all into this common shape; the List view renders it.

export type EntrySource = "group" | "event" | "activity" | "event-span" | "birthday";

export interface CalendarEntry {
  id: string; // stable render key (prefixed by source, e.g. "bday:<uid>:2027")
  source: EntrySource;
  title: string;
  description: string | null;
  location: string | null;
  day: string; // start date, YYYY-MM-DD
  end_day: string | null; // optional inclusive end
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  sort_order: number;
  /** Disambiguates which event an entry belongs to in a multi-event feed (e.g. "Fall Scramble 2027"). NULL for group/birthday entries. */
  context: string | null;
  /** Deep link (event page, activity module, member profile), or NULL for plain entries. */
  href: string | null;
}

/** Add `n` days to a YYYY-MM-DD string (naive-local), returning YYYY-MM-DD. */
export function addDaysYMD(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + n);
  return toYMD(d);
}
