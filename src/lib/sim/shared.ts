/**
 * Issue #128 — shared helpers for sim-mode generators.
 *
 * Generators import these to keep their per-module code small. None of
 * these helpers reaches for the "active trip" — they all operate on an
 * explicit `testTripId` passed by the caller. That's the invariant that
 * makes it impossible for a generator to accidentally write real data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

/**
 * Weighted random pick. Each entry is `[value, weight]`; weight need not
 * sum to 1. Returns one of the values, biased by its weight.
 */
export function weightedPick<T>(entries: Array<readonly [T, number]>): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** Random integer in [min, max] inclusive. */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Shuffle in place (Fisher-Yates). Returns the same array for chaining. */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Chunk an array into groups of `size` (last chunk may be smaller).
 * Used to auto-team Loozers into 3- or 4-player scramble teams.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/**
 * Fetch the roster of "sim-eligible" Loozers: every active user who
 * isn't a system/financial-only account. We never invent fake users —
 * the generator always references real `users.id`s.
 */
export async function listEligibleLoozers(
  client: Client,
): Promise<Array<{ id: string; display_name: string }>> {
  const { data, error } = await client
    .from("users")
    .select("id, display_name, is_system, is_financial_only, is_active")
    .eq("is_active", true)
    .order("display_name");
  if (error) throw new Error(`listEligibleLoozers: ${error.message}`);
  return (data || [])
    .filter((u) => !u.is_system && !u.is_financial_only)
    .map((u) => ({ id: u.id as string, display_name: u.display_name as string }));
}

/**
 * Fetch every contest belonging to the test trip. Used by generators to
 * scope their writes to exactly the contests configured in the test
 * event — and to skip cleanly if none exist yet.
 */
export async function listTestEventContests(
  client: Client,
  testTripId: string,
): Promise<Array<{ id: string; name: string; contest_type: string; day_number: number | null; parent_contest_id: string | null }>> {
  const { data, error } = await client
    .from("contests")
    .select("id, name, contest_type, day_number, parent_contest_id")
    .eq("trip_id", testTripId);
  if (error) throw new Error(`listTestEventContests: ${error.message}`);
  return data || [];
}

/**
 * Resolve the test trip's course_id. Generators that need par per hole
 * walk through this → `course_holes` to look up par/handicap_index per
 * tee × hole. If the trip has no course_id set, the generator falls
 * back to par-4 defaults (Phase 1 simplification).
 */
export async function getTestEventCourseId(
  client: Client,
  testTripId: string,
): Promise<string | null> {
  const { data } = await client
    .from("trip_settings")
    .select("course_id")
    .eq("id", testTripId)
    .maybeSingle();
  return (data?.course_id as string | null) ?? null;
}

/**
 * Look up par per hole for a given course/tee. Returns a Map of
 * hole_number → par. Falls back to par 4 for missing holes.
 */
export async function getHolePars(
  client: Client,
  courseId: string,
  teeId: string,
): Promise<Map<number, number>> {
  const { data } = await client
    .from("course_holes")
    .select("hole_number, par")
    .eq("course_id", courseId)
    .eq("tee_id", teeId);
  const map = new Map<number, number>();
  for (const row of data || []) {
    map.set(row.hole_number as number, row.par as number);
  }
  return map;
}
