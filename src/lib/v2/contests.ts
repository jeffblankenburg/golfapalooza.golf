/**
 * v2 contests (#209, Phase 2a) — shared helpers over the contest spine.
 *
 * A contest is the interactive backing for an `kind='activity'` schedule item
 * (scramble first) or a side game hanging off one (skins, CTP, LD, LP), or an
 * event-spanning aggregate (BSPITW, 100 Feet!). This module owns the create /
 * find-or-create / auto-enroll plumbing; scoring lives in per-type scorers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const CONTEST_TYPES = [
  "scramble", "skins", "ctp", "long_drive", "long_putt",
  "bspitw", "hundred_feet", "ryder_cup", "calcutta", "cornhole", "pickem", "other",
] as const;
export type ContestType = (typeof CONTEST_TYPES)[number];

export const CONTEST_SELECT =
  "id, org_id, event_id, parent_contest_id, contest_type, name, scoring_source, holes, contest_date, start_time, course_id, tee_id, config, payout_splits, auto_enroll, declared_no_winner, status, winners_locked_at, winners_locked_by, sort_order, created_by, created_at, updated_at";

export interface Contest {
  id: string;
  org_id: string;
  event_id: string;
  parent_contest_id: string | null;
  contest_type: ContestType;
  name: string;
  scoring_source: "derived" | "manual";
  holes: number[] | null;
  contest_date: string | null;
  start_time: string | null;
  course_id: string | null;
  tee_id: string | null;
  config: Record<string, unknown> | null;
  payout_splits: unknown;
  auto_enroll: boolean;
  declared_no_winner: boolean;
  status: "draft" | "active" | "final";
  winners_locked_at: string | null;
  winners_locked_by: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Default name when the caller doesn't supply one. */
const TYPE_LABEL: Record<string, string> = {
  scramble: "Scramble", skins: "Skins", ctp: "Closest to the Pin",
  long_drive: "Long Drive", long_putt: "Long Putt", bspitw: "BSPITW",
  hundred_feet: "100 Feet!", ryder_cup: "Ryder Cup", calcutta: "Calcutta",
  cornhole: "Cornhole", pickem: "Pick'em", other: "Contest",
};

/** Human label for a contest type (e.g. "Scramble", "Closest to the Pin"). */
export function contestTypeLabel(type: string): string {
  return TYPE_LABEL[type] || "Contest";
}

/** Derived contests read scores/observations; the rest are hand-adjudicated. */
export function defaultScoringSource(type: ContestType): "derived" | "manual" {
  return type === "scramble" || type === "skins" || type === "bspitw" ? "derived" : "manual";
}

/** These enroll every on-roster member automatically; the rest are opt-in. */
export function defaultAutoEnroll(type: ContestType): boolean {
  return type === "scramble" || type === "ryder_cup" || type === "calcutta";
}

export interface CreateContestInput {
  orgId: string;
  eventId: string;
  contestType: ContestType;
  name?: string;
  parentContestId?: string | null; // set for side games (child of a scramble)
  contestDate?: string | null;      // the day it's played (drives its calendar entry)
  startTime?: string | null;        // HH:MM start; seeds the first tee time
  holes?: number[] | null;
  config?: Record<string, unknown> | null;
  entryAmountCents?: number | null;
  autoEnroll?: boolean;
  createdBy?: string | null;
}

/**
 * Create a contest. Contests are authored here (Contests page), not on the
 * schedule — the calendar derives an entry from `contest_date`. Auto-enrolls the
 * on-roster set for enrolling types (scramble/ryder/calcutta).
 */
export async function createContest(
  admin: SupabaseClient,
  input: CreateContestInput,
): Promise<{ contest: Contest } | { error: string }> {
  const { data, error } = await admin
    .from("v2_contests")
    .insert({
      org_id: input.orgId,
      event_id: input.eventId,
      parent_contest_id: input.parentContestId ?? null,
      contest_type: input.contestType,
      name: (input.name || "").trim() || TYPE_LABEL[input.contestType] || "Contest",
      scoring_source: defaultScoringSource(input.contestType),
      holes: input.holes ?? null,
      contest_date: input.contestDate ?? null,
      start_time: input.startTime ?? null,
      config: input.config ?? null,
      auto_enroll: input.autoEnroll ?? defaultAutoEnroll(input.contestType),
      created_by: input.createdBy ?? null,
    })
    .select(CONTEST_SELECT)
    .single();
  if (error) return { error: error.message };
  const contest = data as Contest;
  if (contest.auto_enroll) await autoEnrollFromRoster(admin, contest.id, input.eventId);
  await setContestBuyIn(admin, contest, input.entryAmountCents ?? null);
  return { contest };
}

/**
 * The buy-in cost item for a contest/side game (#213). The AMOUNT lives only
 * here — v2_cost_items is the single source of truth; the contest's buy-in field
 * reads/writes this row. `cents` is authoritative:
 *   - a positive number → upsert (sets amount; keeps the reconciliation flags)
 *   - 0 or null         → delete the row (no buy-in)
 *   - undefined         → leave the amount alone, only re-sync the display name
 *                         (used when editing a contest's name/date, not its buy-in)
 * The cost item's name mirrors the contest name (a display label, not money).
 */
export async function setContestBuyIn(admin: SupabaseClient, contest: Contest, cents: number | null | undefined): Promise<void> {
  const sourceType = contest.parent_contest_id ? "side_game" : "contest";
  const { data: existing } = await admin
    .from("v2_cost_items").select("id").eq("source_type", sourceType).eq("source_id", contest.id).maybeSingle();

  if (cents === undefined) {
    if (existing) await admin.from("v2_cost_items").update({ name: contest.name, updated_at: new Date().toISOString() }).eq("id", existing.id);
    return;
  }
  if (!cents || cents <= 0) {
    if (existing) await admin.from("v2_cost_items").delete().eq("id", existing.id);
    return;
  }
  if (existing) {
    await admin.from("v2_cost_items").update({ name: contest.name, amount_cents: cents, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    await admin.from("v2_cost_items").insert({
      org_id: contest.org_id, event_id: contest.event_id, name: contest.name, amount_cents: cents,
      category: sourceType, source_type: sourceType, source_id: contest.id, created_by: contest.created_by,
    });
  }
}

/** Buy-in amounts (cents) for a set of contests/side games, keyed by contest id. */
export async function loadBuyInCents(admin: SupabaseClient, contestIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!contestIds.length) return out;
  const { data } = await admin
    .from("v2_cost_items").select("source_id, amount_cents")
    .in("source_type", ["contest", "side_game"]).in("source_id", contestIds);
  for (const r of data || []) if (r.source_id) out.set(r.source_id as string, r.amount_cents as number);
  return out;
}

/** Remove the cost_items projected from a contest and its descendants (on delete). */
export async function deleteContestCostItems(admin: SupabaseClient, contestId: string): Promise<void> {
  const { data: children } = await admin.from("v2_contests").select("id").eq("parent_contest_id", contestId);
  const ids = [contestId, ...(children || []).map((c) => c.id as string)];
  await admin.from("v2_cost_items").delete().in("source_id", ids);
}

/**
 * Seed a contest's participants from the event roster (on_roster members) that
 * aren't already in it. Additive only — never removes anyone (removal is guarded
 * elsewhere). Returns the number added.
 */
export async function autoEnrollFromRoster(
  admin: SupabaseClient,
  contestId: string,
  eventId: string,
): Promise<number> {
  const { data: roster } = await admin
    .from("v2_event_participants")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("on_roster", true);
  const rosterIds = (roster || []).map((r) => r.user_id as string);
  if (rosterIds.length === 0) return 0;

  const { data: existing } = await admin
    .from("v2_contest_participants")
    .select("user_id")
    .eq("contest_id", contestId);
  const have = new Set((existing || []).map((r) => r.user_id as string));

  const toAdd = rosterIds.filter((id) => !have.has(id)).map((user_id) => ({ contest_id: contestId, user_id }));
  if (toAdd.length === 0) return 0;
  const { error } = await admin.from("v2_contest_participants").insert(toAdd);
  if (error) return 0;
  return toAdd.length;
}
