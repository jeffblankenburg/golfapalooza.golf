// Compute live participant counts and totals for payout_sheet_events rows.
// Used by the admin payouts page, the Payout Denominations tab, and any
// leaderboard that wants to show a payout figure for an event.
//
// All sources resolve to a non-negative integer count of "people currently in"
// for that event on the given trip.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayoutSplit } from "./splits";

export type ParticipantSource =
  | "option"
  | "option_value"
  | "scramble"
  | "all_attendees"
  | "pickem_payments"
  | "manual";

export interface PayoutSheetEvent {
  id: string;
  trip_id: string;
  label: string;
  sort_order: number;
  participant_source: ParticipantSource;
  source_ref: string | null;
  source_filter: { choice_values?: string[]; count?: number } | null;
  /**
   * Per-participant amount. For contest-linked rows, comes from the
   * contest's `buy_in_cost_item` cost (overlaid at projection time).
   * For Lodge-style pass-through rows, comes from the row's stored
   * `amount_per_participant`.
   */
  amount_per_participant: number;
  day_count: number;
  is_payout: boolean;
  notes: string | null;
  /**
   * Per-place split for the contest's pot. Sourced from the linked
   * contest (issue #124 Phase F dropped the row-level column).
   * null for non-payout rows (Lodge) or unconfigured contests.
   */
  payout_splits: PayoutSplit[] | null;
  /**
   * Projected from `contest.buy_in_cost_item_id` when a contest is linked.
   * null for Lodge-style pass-through rows (no contest = no single
   * cost_item; admin manages amount_per_participant directly).
   */
  cost_item_id: string | null;
  contest_id: string | null;
  contest: PayoutSheetEventContest | null;
}

/**
 * Subset of `contests` columns that drive payout behavior. Filled by
 * `loadPayoutSheet` via the `contest_id` FK. When a row's `contest_id`
 * is set, the contest IS the source of truth for cost_item_id and
 * payout_splits — `loadPayoutSheet` overrides the stored row values with
 * the contest's, so the rest of the system can keep reading
 * `row.payout_splits` and `row.cost_item_id` unchanged.
 */
export interface PayoutSheetEventContest {
  id: string;
  name: string;
  contest_type: string;
  day_number: number | null;
  parent_contest_id: string | null;
  buy_in_cost_item_id: string | null;
  payout_splits: PayoutSplit[] | null;
}

export interface PayoutSheetRow extends PayoutSheetEvent {
  participant_count: number;
  total: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

async function countOption(client: Client, optionId: string): Promise<number> {
  const { data: option } = await client
    .from("trip_options")
    .select("option_type")
    .eq("id", optionId)
    .single();
  if (!option) return 0;

  const { data: selections } = await client
    .from("user_option_selections")
    .select("value")
    .eq("option_id", optionId);
  if (!selections) return 0;

  if (option.option_type === "checkbox") {
    return selections.filter((s) => s.value === true).length;
  }
  // select / multi_select — "in" means the user picked a choice value that
  // funds a cost_item (issue #125 Phase 5 — choice cost moved out of JSONB).
  // Paid choice values come from cost_item_option_choices joined via
  // cost_items.linked_option_id.
  const { data: linkedItems } = await client
    .from("cost_items")
    .select("id, choices:cost_item_option_choices(choice_value)")
    .eq("linked_option_id", optionId);
  const paidValues = new Set<string>();
  for (const item of linkedItems || []) {
    for (const c of (item.choices as Array<{ choice_value: string }> | null) || []) {
      paidValues.add(c.choice_value);
    }
  }
  if (paidValues.size === 0) return 0;
  let count = 0;
  for (const s of selections) {
    const v = s.value;
    if (typeof v === "string" && paidValues.has(v)) count += 1;
    else if (Array.isArray(v)) {
      if ((v as unknown[]).some((x) => typeof x === "string" && paidValues.has(x))) count += 1;
    }
  }
  return count;
}

async function countOptionValue(
  client: Client,
  optionId: string,
  values: string[],
): Promise<number> {
  if (!values || values.length === 0) return 0;
  const { data, error } = await client
    .from("user_option_selections")
    .select("value")
    .eq("option_id", optionId);
  if (error || !data) return 0;
  const set = new Set(values);
  let count = 0;
  for (const s of data) {
    if (typeof s.value === "string" && set.has(s.value)) count += 1;
  }
  return count;
}

async function countScramble(client: Client, contestId: string): Promise<number> {
  const { count } = await client
    .from("contest_participants")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", contestId);
  return count || 0;
}

async function countAllAttendees(client: Client, tripId: string): Promise<number> {
  const { count } = await client
    .from("event_participants")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .eq("on_roster", true);
  return count || 0;
}

async function countPickemPaid(client: Client, contestId: string): Promise<number> {
  const { count } = await client
    .from("pickem_payments")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", contestId)
    .eq("paid", true);
  return count || 0;
}

export async function computeParticipantCount(
  client: Client,
  tripId: string,
  event: PayoutSheetEvent,
): Promise<number> {
  // Issue #124: when a row is linked to a contest, the contest's roster
  // (`contest_participants`) is the single source of truth — same list the
  // contest list, scramble team builder, etc. all read. Pot count agrees
  // with what admins see everywhere else. Lodge-style rows (no contest)
  // fall through to the legacy `participant_source` discriminator.
  if (event.contest_id) {
    return countScramble(client, event.contest_id);
  }
  switch (event.participant_source) {
    case "option":
      return event.source_ref ? countOption(client, event.source_ref) : 0;
    case "option_value":
      return event.source_ref
        ? countOptionValue(client, event.source_ref, event.source_filter?.choice_values || [])
        : 0;
    case "scramble":
      return event.source_ref ? countScramble(client, event.source_ref) : 0;
    case "all_attendees":
      return countAllAttendees(client, tripId);
    case "pickem_payments":
      return event.source_ref ? countPickemPaid(client, event.source_ref) : 0;
    case "manual":
      return Math.max(0, Math.floor(event.source_filter?.count ?? 0));
  }
}

type CostItemJoin = { cost: number | string } | { cost: number | string }[] | null | undefined;

// Raw shape from PostgREST. The contest join nests its own buy_in cost
// item so the contest's current cost ships without an extra round-trip.
type RawJoinedContest = PayoutSheetEventContest & {
  buy_in_cost_item?: CostItemJoin;
};

type RawJoinedRow = Omit<PayoutSheetEvent, "amount_per_participant" | "payout_splits" | "contest"> & {
  amount_per_participant: number | string;
  contest?: RawJoinedContest | RawJoinedContest[] | null;
};

function unwrapJoin<T>(raw: T | T[] | null | undefined): T | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

function costFromJoin(raw: CostItemJoin): number | null {
  const item = unwrapJoin(raw);
  if (!item) return null;
  const cost = Number(item.cost);
  return Number.isFinite(cost) ? cost : null;
}

/**
 * Project a raw row into the canonical `PayoutSheetEvent` shape. When
 * a contest is linked, contest fields (cost, splits) are authoritative.
 * For Lodge-style pass-through rows (no contest), the row's stored
 * `amount_per_participant` stands, and `payout_splits` is null.
 */
function projectRow(raw: RawJoinedRow): PayoutSheetEvent {
  const contest = unwrapJoin(raw.contest);
  const contestCost = contest ? costFromJoin(contest.buy_in_cost_item) : null;
  const amount_per_participant =
    contestCost != null ? contestCost : Number(raw.amount_per_participant) || 0;

  const payout_splits = contest ? contest.payout_splits : null;

  const projectedContest: PayoutSheetEventContest | null = contest
    ? {
        id: contest.id,
        name: contest.name,
        contest_type: contest.contest_type,
        day_number: contest.day_number,
        parent_contest_id: contest.parent_contest_id,
        buy_in_cost_item_id: contest.buy_in_cost_item_id,
        payout_splits: contest.payout_splits,
      }
    : null;

  return {
    id: raw.id,
    trip_id: raw.trip_id,
    label: raw.label,
    sort_order: raw.sort_order,
    participant_source: raw.participant_source,
    source_ref: raw.source_ref,
    source_filter: raw.source_filter,
    amount_per_participant,
    day_count: raw.day_count,
    is_payout: raw.is_payout,
    notes: raw.notes,
    payout_splits,
    cost_item_id: contest?.buy_in_cost_item_id ?? null,
    contest_id: raw.contest_id,
    contest: projectedContest,
  };
}

export async function loadPayoutSheet(
  client: Client,
  tripId: string,
): Promise<PayoutSheetRow[]> {
  const { data: events, error } = await client
    .from("payout_sheet_events")
    .select(
      "id, trip_id, label, sort_order, participant_source, source_ref, source_filter, amount_per_participant, day_count, is_payout, notes, contest_id, contest:contests(id, name, contest_type, day_number, parent_contest_id, buy_in_cost_item_id, payout_splits, buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost))",
    )
    .eq("trip_id", tripId)
    .order("sort_order");
  if (error || !events) return [];

  const projected = (events as unknown as RawJoinedRow[]).map(projectRow);

  const counts = await Promise.all(
    projected.map((e) => computeParticipantCount(client, tripId, e)),
  );

  return projected.map((ev, i) => {
    const c = counts[i];
    const total =
      Math.round((Number(ev.amount_per_participant) || 0) * c * (ev.day_count || 1) * 100) / 100;
    return { ...ev, participant_count: c, total };
  });
}
