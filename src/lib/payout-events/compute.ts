// Compute live participant counts and totals for payout_sheet_events rows.
// Used by the admin payouts page, the Payout Denominations tab, and any
// leaderboard that wants to show a payout figure for an event.
//
// All sources resolve to a non-negative integer count of "people currently in"
// for that event on the given trip.

import type { SupabaseClient } from "@supabase/supabase-js";

export type ParticipantSource =
  | "option"
  | "option_value"
  | "scramble"
  | "all_attendees"
  | "pickem_payments"
  | "manual";

export type WinnerSource =
  | "scramble_team"
  | "scramble_skins"
  | "ctp_front"
  | "ctp_back"
  | "long_drive"
  | "long_putt"
  | "hundred_feet"
  | "pickem"
  | "none";

export interface PayoutSheetEvent {
  id: string;
  trip_id: string;
  label: string;
  sort_order: number;
  participant_source: ParticipantSource;
  source_ref: string | null;
  source_filter: { choice_values?: string[]; count?: number } | null;
  amount_per_participant: number;
  day_count: number;
  is_payout: boolean;
  notes: string | null;
  winner_source: WinnerSource | null;
  winner_day_number: number | null;
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
    .select("option_type, choices")
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
  // select / multi_select / number / text — treat as "in" when chosen
  // value's cost > 0 (i.e. they paid for the contest).
  const choiceCost = new Map<string, number>();
  for (const ch of (option.choices as Array<{ value: string; cost?: number }>) || []) {
    choiceCost.set(ch.value, Number(ch.cost) || 0);
  }
  let count = 0;
  for (const s of selections) {
    const v = s.value;
    if (typeof v === "string" && (choiceCost.get(v) || 0) > 0) count += 1;
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

export async function loadPayoutSheet(
  client: Client,
  tripId: string,
): Promise<PayoutSheetRow[]> {
  const { data: events, error } = await client
    .from("payout_sheet_events")
    .select(
      "id, trip_id, label, sort_order, participant_source, source_ref, source_filter, amount_per_participant, day_count, is_payout, winner_source, winner_day_number, notes",
    )
    .eq("trip_id", tripId)
    .order("sort_order");
  if (error || !events) return [];

  const counts = await Promise.all(
    events.map((e) => computeParticipantCount(client, tripId, e as PayoutSheetEvent)),
  );

  return events.map((e, i) => {
    const ev = e as PayoutSheetEvent;
    const c = counts[i];
    const total =
      Math.round((Number(ev.amount_per_participant) || 0) * c * (ev.day_count || 1) * 100) / 100;
    return { ...ev, participant_count: c, total };
  });
}
