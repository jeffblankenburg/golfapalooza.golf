/**
 * Merged member calendar composer (#208).
 *
 * A member's "Schedule" is ONE seamless feed. This composes it at read time from
 * several sources so each stays authoritative (no duplicated/drifting rows):
 *
 *   authored  — v2_schedule_items: group-level (event_id NULL) + active-event items
 *   derived   — one all-day span per active event (from v2_events.start/end_date)
 *   derived   — birthdays projected from v2_profiles.birthdate (opt-out per org)
 *   provided  — activity time items (tee times, auction start…) once modules exist
 *
 * Scope: group items + birthdays always; event/activity items only for events with
 * status='active' (per the product decision). Windowed to the recent past forward
 * to keep a year-spanning, multi-year feed bounded (Supabase 1000-row cap).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDaysYMD, toYMD, type CalendarEntry, type ScheduleKind } from "./schedule";
import { pickName, type NameMode } from "./profile";

/** How far back the feed reaches; everything from here forward is included. */
const PAST_WINDOW_DAYS = 30;
/** How far ahead derived birthdays project (authored items have no forward cap). */
const BIRTHDAY_HORIZON_DAYS = 400;

interface AuthoredRow {
  id: string;
  event_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  day: string;
  end_day: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  sort_order: number;
  kind: ScheduleKind;
  activity_type: string | null;
  activity_id: string | null;
}

export interface BuildScheduleOpts {
  /** For deep links (member profiles, event pages). */
  slug: string;
  /** Simulator-aware "today", YYYY-MM-DD. */
  today: string;
  /** Include derived birthday entries (in-app: true; public iCal: false for privacy). */
  includeBirthdays?: boolean;
  /** Org name-display mode for birthday labels. */
  nameMode?: NameMode;
}

/**
 * Compose the merged member calendar for an org. Uses the admin client (caller
 * has already gated membership) and returns entries sorted by day, then time.
 */
export async function buildMemberSchedule(
  admin: SupabaseClient,
  orgId: string,
  opts: BuildScheduleOpts,
): Promise<CalendarEntry[]> {
  const { slug, today, includeBirthdays = true, nameMode = "nickname" } = opts;
  const windowStart = addDaysYMD(today, -PAST_WINDOW_DAYS);

  // Active events drive both the event-span entries and which authored event
  // items are visible. Fetched first so the item query can scope to them.
  const { data: eventRows } = await admin
    .from("v2_events")
    .select("id, name, start_date, end_date, status")
    .eq("org_id", orgId)
    .eq("status", "active");
  const events = eventRows || [];
  const eventById = new Map(events.map((e) => [e.id, e]));
  const activeIds = events.map((e) => e.id);

  const entries: CalendarEntry[] = [];

  // ── Authored items: group-level (event_id NULL) + items of active events ─────
  // A single query with an OR so it's one round-trip.
  const eventClause = activeIds.length ? `event_id.in.(${activeIds.join(",")})` : null;
  const orFilter = eventClause ? `event_id.is.null,${eventClause}` : "event_id.is.null";
  const { data: itemRows } = await admin
    .from("v2_schedule_items")
    .select(
      "id, event_id, title, description, location, day, end_day, start_time, end_time, all_day, sort_order, kind, activity_type, activity_id",
    )
    .eq("org_id", orgId)
    .or(orFilter)
    .gte("day", windowStart)
    .order("day");

  for (const it of (itemRows || []) as AuthoredRow[]) {
    const ev = it.event_id ? eventById.get(it.event_id) : null;
    entries.push({
      id: `item:${it.id}`,
      source: it.activity_id ? "activity" : it.event_id ? "event" : "group",
      title: it.title,
      description: it.description,
      location: it.location,
      day: it.day,
      end_day: it.end_day,
      start_time: it.start_time,
      end_time: it.end_time,
      all_day: it.all_day,
      sort_order: it.sort_order,
      context: ev ? ev.name : null,
      href: null,
    });
  }

  // ── Derived: one all-day span per active event ───────────────────────────────
  for (const ev of events) {
    if (!ev.start_date) continue;
    const end = ev.end_date && ev.end_date !== ev.start_date ? ev.end_date : null;
    // Skip spans wholly before the window.
    if ((end || ev.start_date) < windowStart) continue;
    entries.push({
      id: `event:${ev.id}`,
      source: "event-span",
      title: ev.name,
      description: null,
      location: null,
      day: ev.start_date,
      end_day: end,
      start_time: null,
      end_time: null,
      all_day: true,
      sort_order: -100, // sort an event banner above the day's timed items
      context: null,
      href: null,
    });
  }

  // ── Derived: birthdays from member profiles (opt-out per org) ────────────────
  if (includeBirthdays) {
    const { data: members } = await admin
      .from("v2_memberships")
      .select("user_id, v2_profiles!inner(id, display_name, first_name, last_name, birthdate)")
      .eq("org_id", orgId)
      .eq("status", "active");
    const horizonEnd = addDaysYMD(today, BIRTHDAY_HORIZON_DAYS);
    for (const m of members || []) {
      // The embedded profile comes back as an object (single row via !inner).
      const p = (m as { v2_profiles: unknown }).v2_profiles as {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
        birthdate: string | null;
      } | null;
      if (!p?.birthdate) continue;
      const md = p.birthdate.slice(5); // MM-DD
      const name = pickName(p, nameMode);
      // Project into the years overlapping the window (usually 1-2 occurrences).
      for (let y = Number(windowStart.slice(0, 4)); y <= Number(horizonEnd.slice(0, 4)); y++) {
        const occ = `${y}-${md}`;
        if (occ < windowStart || occ > horizonEnd) continue;
        entries.push({
          id: `bday:${p.id}:${y}`,
          source: "birthday",
          title: `${name}'s birthday`,
          description: null,
          location: null,
          day: occ,
          end_day: null,
          start_time: null,
          end_time: null,
          all_day: true,
          sort_order: -50, // above timed items, below the event banner
          context: null,
          href: `/new/${slug}/loozers/${p.id}`,
        });
      }
    }
  }

  // ── Provided: activity time items (tee times etc.) ───────────────────────────
  // Modules aren't built yet; when they are, each active activity projects its
  // time-sensitive rows here (source:"activity", context: event name, href: module).

  // Sort the merged feed: by day, then all-day/banner first, then time, then order.
  entries.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      Number(b.all_day) - Number(a.all_day) ||
      a.sort_order - b.sort_order ||
      (a.start_time || "99").localeCompare(b.start_time || "99"),
  );
  return entries;
}

/** Convenience for callers that want to know "is anything scheduled." */
export function scheduleIsEmpty(entries: CalendarEntry[]): boolean {
  return entries.length === 0;
}

// Re-export so callers importing the composer get the window constant if needed.
export { toYMD };
