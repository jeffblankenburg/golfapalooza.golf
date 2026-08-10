import type { SupabaseClient } from "@supabase/supabase-js";

// Badge labels for the four daily contest types, shown on the hole during
// live scoring. ctp_front/ctp_back collapse to one "Closest to the Pin" label
// since a live round only ever hits one CTP hole per nine.
const CONTEST_BADGE_LABELS: Record<string, string> = {
  ctp_front: "Closest to the Pin",
  ctp_back: "Closest to the Pin",
  long_drive: "Long Drive",
  long_putt: "Long Putt",
};

const DAILY_CONTEST_TYPES = Object.keys(CONTEST_BADGE_LABELS);

/**
 * Given a round's course + date, find the trip day it belongs to and return a
 * map of hole_number → contest badge labels for that day's daily contests.
 *
 * Personal/scramble rounds aren't linked to a trip day in the schema, so we
 * match implicitly: a round belongs to a trip day when it's played on the
 * trip's course (`trip_settings.course_id`) on the date that day falls on
 * (`start_date + day_number - 1`). Trips are single-course, so the course
 * match is exact and hole numbers line up unambiguously.
 *
 * Returns an empty object when the round doesn't match any trip day or that
 * day has no holes assigned.
 */
export async function getDailyContestHolesForRound(
  adminClient: SupabaseClient,
  round: { course_id: string | null; round_date: string | null },
): Promise<Record<number, string[]>> {
  if (!round.course_id || !round.round_date) return {};

  // Trips on this course. Usually one, but the same course can recur across
  // years — date matching below disambiguates.
  const { data: trips } = await adminClient
    .from("trip_settings")
    .select("id, start_date")
    .eq("course_id", round.course_id);
  if (!trips || trips.length === 0) return {};

  // Compute the day_number this round_date maps to for each candidate trip.
  const roundMs = new Date(round.round_date + "T00:00:00").getTime();
  const dayByTrip = new Map<string, number>();
  for (const t of trips as { id: string; start_date: string | null }[]) {
    if (!t.start_date) continue;
    const startMs = new Date(t.start_date + "T00:00:00").getTime();
    const dayNumber = Math.round((roundMs - startMs) / 86_400_000) + 1;
    // A sane trip window — daily contests only exist for early days, but cap
    // generously so we don't miss a long event.
    if (dayNumber >= 1 && dayNumber <= 14) dayByTrip.set(t.id, dayNumber);
  }
  if (dayByTrip.size === 0) return {};

  const { data: contests } = await adminClient
    .from("contests")
    .select("trip_id, day_number, contest_type, hole_number")
    .in("trip_id", [...dayByTrip.keys()])
    .in("contest_type", DAILY_CONTEST_TYPES)
    .not("hole_number", "is", null);
  if (!contests || contests.length === 0) return {};

  const map: Record<number, string[]> = {};
  for (const c of contests as Array<{
    trip_id: string;
    day_number: number | null;
    contest_type: string;
    hole_number: number | null;
  }>) {
    // Only rows whose day_number matches the round's date for that trip.
    if (c.day_number == null || c.hole_number == null) continue;
    if (dayByTrip.get(c.trip_id) !== c.day_number) continue;
    const label = CONTEST_BADGE_LABELS[c.contest_type];
    if (!label) continue;
    const list = map[c.hole_number] ?? (map[c.hole_number] = []);
    if (!list.includes(label)) list.push(label);
  }
  return map;
}
