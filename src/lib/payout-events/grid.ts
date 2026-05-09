// Server-side aggregator that produces the Loozer × payout-event grid.
// Reads winners from the canonical sources (no duplicate winner entry):
//   - scramble Team payouts: scramble_teams ordered by gross_score
//   - scramble Skins: live skins computation per scramble (calcSkins)
//   - daily contests (CTP front/back, Long Drive, Long Putt): daily_contest_winners
//   - 100 ft.: lowest cumulative hundred_feet_scores total
//   - PickEm: derived rankings × pickem_settings.payout_json
// Pickem paid status is read through pickem_payouts; everything else uses
// payout_paid_status keyed by the config row id.
//
// Performance note: bulk-fetch the world up front in two parallel batches,
// then compute cells synchronously. Per-row handlers are pure functions over
// in-memory data — no per-row queries.

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcSkins } from "@/lib/skins";
import type { PayoutSheetEvent } from "./compute";
import { computePayoutSplits } from "./splits";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface GridLoozer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface GridEvent {
  key: string;
  label: string;
  sort_order: number;
  is_payout: boolean;
  total: number;
  pickem: boolean;
}

export interface GridCell {
  user_id: string;
  event_key: string;
  amount: number;
  paid: boolean;
}

export interface GridData {
  loozers: GridLoozer[];
  events: GridEvent[];
  cells: GridCell[];
}

type Kind =
  | "scramble_team"
  | "scramble_skins"
  | "ctp_front"
  | "ctp_back"
  | "long_drive"
  | "long_putt"
  | "hundred_feet"
  | "pickem"
  | "unknown";

// Prefer the explicit winner_source column. Falls back to label-substring
// matching for any row where the column isn't yet populated (during the
// migration window before 00137 is applied + backfilled).
function classify(row: PayoutSheetEvent): Kind {
  if (row.winner_source) {
    if (row.winner_source === "none") return "unknown";
    return row.winner_source;
  }
  const lbl = row.label.toLowerCase();
  if (row.participant_source === "scramble") {
    if (lbl.includes("skins")) return "scramble_skins";
    if (lbl.includes("team")) return "scramble_team";
  }
  if (row.participant_source === "pickem_payments") return "pickem";
  if (lbl.includes("100") || lbl.includes("hundred")) return "hundred_feet";
  if (lbl.includes("ctp") || lbl.includes("par 3") || lbl.includes("closest")) {
    if (lbl.includes("back")) return "ctp_back";
    return "ctp_front";
  }
  if (lbl.includes("long drive") || lbl === "bro ld") return "long_drive";
  if (lbl.includes("long putt") || lbl === "bro lp") return "long_putt";
  return "unknown";
}

const DAY_NAMES: Array<{ name: string; day: number }> = [
  { name: "thursday", day: 2 },
  { name: "friday", day: 3 },
  { name: "saturday", day: 4 },
];

// Prefer winner_day_number; fall back to parsing the label.
function dayForRow(row: PayoutSheetEvent): number | null {
  if (typeof row.winner_day_number === "number") return row.winner_day_number;
  const lbl = row.label.toLowerCase();
  for (const { name, day } of DAY_NAMES) if (lbl.includes(name)) return day;
  return null;
}

function dayFromLabel(label: string): number | null {
  const lbl = label.toLowerCase();
  for (const { name, day } of DAY_NAMES) if (lbl.includes(name)) return day;
  return null;
}

// ── Bulk-fetched data shape ─────────────────────────────────────────────

interface BulkData {
  participantCounts: Map<string, number>; // event.id → count
  // Scramble: contest_id → teams (with members + gross_score)
  scrambleTeams: Map<string, Array<{ id: string; gross_score: number | null; team_handicap: number; members: Array<{ user_id: string }> }>>;
  // Scramble: contest_id → hole scores keyed by team_id → hole_number → strokes
  scrambleHoleScores: Map<string, Record<string, Record<number, number>>>;
  // Scramble: contest_id → holes used (with handicap_index)
  scrambleHoles: Map<string, Array<{ hole_number: number; handicap_index: number }>>;
  // daily_contest_winners by day_number → contest_type → user_id
  dailyWinners: Map<number, Map<string, string>>;
  // hundred_feet: best (lowest total) user_id, or null
  hundredFeetWinner: string | null;
  // pickem
  pickemSettings: { entry_fee: number; payout_json: Array<{ place: number; percentage?: number; amount?: number }> } | null;
  pickemPaidUsers: Set<string>;
  pickemRanked: string[]; // user_ids sorted by rank descending
  pickemPot: number;
  // paid status
  paidStatus: Map<string, boolean>;       // `${user_id}|${cell_key}` → paid
  pickemPaid: Map<string, boolean>;       // `${user_id}|${event_key}` → paid
}

// Helper: aggregate per-row participant counts via batched queries.
async function fetchParticipantCounts(
  client: Client,
  tripId: string,
  events: PayoutSheetEvent[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (events.length === 0) return counts;

  const optionIds = new Set<string>();
  const scrambleContestIds = new Set<string>();
  const pickemContestIds = new Set<string>();
  const allAttendeesEventIds: string[] = [];
  const optionEventIds: string[] = [];
  const scrambleEventIds: string[] = [];
  const pickemEventIds: string[] = [];
  const optionValueEventIds: string[] = [];

  for (const e of events) {
    if (e.participant_source === "all_attendees") allAttendeesEventIds.push(e.id);
    else if (e.participant_source === "option" && e.source_ref) {
      optionIds.add(e.source_ref);
      optionEventIds.push(e.id);
    } else if (e.participant_source === "option_value" && e.source_ref) {
      optionIds.add(e.source_ref);
      optionValueEventIds.push(e.id);
    } else if (e.participant_source === "scramble" && e.source_ref) {
      scrambleContestIds.add(e.source_ref);
      scrambleEventIds.push(e.id);
    } else if (e.participant_source === "pickem_payments" && e.source_ref) {
      pickemContestIds.add(e.source_ref);
      pickemEventIds.push(e.id);
    }
  }

  const [
    rosterCountRes,
    optionMetaRes,
    optionSelsRes,
    scrambleParticipantsRes,
    pickemPaidCountRes,
  ] = await Promise.all([
    allAttendeesEventIds.length > 0
      ? client
          .from("event_participants")
          .select("id", { count: "exact", head: true })
          .eq("trip_id", tripId)
          .eq("on_roster", true)
      : Promise.resolve({ count: 0 }),
    optionIds.size > 0
      ? client
          .from("trip_options")
          .select("id, option_type, choices")
          .in("id", [...optionIds])
      : Promise.resolve({ data: [] }),
    optionIds.size > 0
      ? client
          .from("user_option_selections")
          .select("option_id, value")
          .in("option_id", [...optionIds])
      : Promise.resolve({ data: [] }),
    scrambleContestIds.size > 0
      ? client
          .from("contest_participants")
          .select("contest_id")
          .in("contest_id", [...scrambleContestIds])
      : Promise.resolve({ data: [] }),
    pickemContestIds.size > 0
      ? client
          .from("pickem_payments")
          .select("contest_id")
          .in("contest_id", [...pickemContestIds])
          .eq("paid", true)
      : Promise.resolve({ data: [] }),
  ]);

  // all_attendees: same count for every row using it
  const rosterCount = rosterCountRes.count || 0;
  for (const id of allAttendeesEventIds) counts.set(id, rosterCount);

  // option / option_value: bucket selections by option_id
  const selsByOpt = new Map<string, Array<{ value: unknown }>>();
  for (const s of (optionSelsRes.data as Array<{ option_id: string; value: unknown }> | null) || []) {
    if (!selsByOpt.has(s.option_id)) selsByOpt.set(s.option_id, []);
    selsByOpt.get(s.option_id)!.push({ value: s.value });
  }
  const optionMetaById = new Map<string, { option_type: string; choices: Array<{ value: string; cost?: number }> | null }>();
  for (const o of (optionMetaRes.data as Array<{ id: string; option_type: string; choices: Array<{ value: string; cost?: number }> | null }> | null) || []) {
    optionMetaById.set(o.id, { option_type: o.option_type, choices: o.choices });
  }

  for (const evId of optionEventIds) {
    const ev = events.find((e) => e.id === evId)!;
    const optId = ev.source_ref!;
    const meta = optionMetaById.get(optId);
    const sels = selsByOpt.get(optId) || [];
    if (!meta) {
      counts.set(evId, 0);
      continue;
    }
    if (meta.option_type === "checkbox") {
      counts.set(evId, sels.filter((s) => s.value === true).length);
      continue;
    }
    const cost = new Map<string, number>();
    for (const ch of meta.choices || []) cost.set(ch.value, Number(ch.cost) || 0);
    counts.set(
      evId,
      sels.filter((s) => typeof s.value === "string" && (cost.get(s.value as string) || 0) > 0).length,
    );
  }

  for (const evId of optionValueEventIds) {
    const ev = events.find((e) => e.id === evId)!;
    const optId = ev.source_ref!;
    const wanted = new Set(ev.source_filter?.choice_values || []);
    const sels = selsByOpt.get(optId) || [];
    counts.set(
      evId,
      sels.filter((s) => typeof s.value === "string" && wanted.has(s.value as string)).length,
    );
  }

  // scramble: count participants per contest
  const scrambleCountByContest = new Map<string, number>();
  for (const r of (scrambleParticipantsRes.data as Array<{ contest_id: string }> | null) || []) {
    scrambleCountByContest.set(r.contest_id, (scrambleCountByContest.get(r.contest_id) || 0) + 1);
  }
  for (const evId of scrambleEventIds) {
    const ev = events.find((e) => e.id === evId)!;
    counts.set(evId, scrambleCountByContest.get(ev.source_ref!) || 0);
  }

  // pickem_payments: count paid per contest
  const pickemPaidByContest = new Map<string, number>();
  for (const r of (pickemPaidCountRes.data as Array<{ contest_id: string }> | null) || []) {
    pickemPaidByContest.set(r.contest_id, (pickemPaidByContest.get(r.contest_id) || 0) + 1);
  }
  for (const evId of pickemEventIds) {
    const ev = events.find((e) => e.id === evId)!;
    counts.set(evId, pickemPaidByContest.get(ev.source_ref!) || 0);
  }

  return counts;
}

// ── Cell handlers (synchronous, operate on bulk data) ────────────────────

function cellsForScrambleTeam(
  row: PayoutSheetEvent,
  total: number,
  bulk: BulkData,
): GridCell[] {
  if (!row.source_ref) return [];
  const teams = bulk.scrambleTeams.get(row.source_ref);
  if (!teams || teams.length === 0) return [];
  if (!teams.every((t) => t.gross_score !== null)) return [];

  // Sort by NET score (gross − team_handicap) — lowest net wins.
  // Matches the leaderboard ordering on /scrambles.
  const sorted = [...teams].sort((a, b) => {
    const aNet = (Number(a.gross_score) || 0) - (Number(a.team_handicap) || 0);
    const bNet = (Number(b.gross_score) || 0) - (Number(b.team_handicap) || 0);
    return aNet - bNet;
  });

  // Per-place team amounts come from the row's admin-configured payout_splits.
  const placeAmounts = computePayoutSplits(total, row.payout_splits);

  const cells: GridCell[] = [];
  for (const [place, amount] of placeAmounts) {
    const team = sorted[place - 1];
    if (!team || amount <= 0) continue;
    const members = team.members || [];
    if (members.length === 0) continue;
    const per = Math.round((amount / members.length) * 100) / 100;
    for (const m of members) {
      cells.push({ user_id: m.user_id, event_key: row.id, amount: per, paid: false });
    }
  }
  return cells;
}

function cellsForScrambleSkins(
  row: PayoutSheetEvent,
  total: number,
  bulk: BulkData,
): GridCell[] {
  if (!row.source_ref) return [];
  const teams = bulk.scrambleTeams.get(row.source_ref);
  const holeScores = bulk.scrambleHoleScores.get(row.source_ref);
  const holes = bulk.scrambleHoles.get(row.source_ref);
  if (!teams || teams.length === 0 || !holeScores || !holes) return [];
  if (!teams.every((t) => t.gross_score !== null)) return [];

  const skinTeams = teams.map((t) => ({ id: t.id, team_handicap: 0 })); // team_handicap not used by calcSkins for scramble result counts at this granularity
  const result = calcSkins(skinTeams, holes, holeScores);
  if (result.totalSkins <= 0) return [];

  const cells: GridCell[] = [];
  for (const team of teams) {
    const skins = result.skinCounts.get(team.id) || 0;
    if (skins <= 0) continue;
    const teamShare = (skins / result.totalSkins) * total;
    const members = team.members || [];
    if (members.length === 0) continue;
    const per = Math.round((teamShare / members.length) / 5) * 5; // round to nearest $5
    if (per <= 0) continue;
    for (const m of members) {
      cells.push({ user_id: m.user_id, event_key: row.id, amount: per, paid: false });
    }
  }
  return cells;
}

function cellsForCtp(
  row: PayoutSheetEvent,
  total: number,
  myType: "ctp_front" | "ctp_back",
  allRows: PayoutSheetEvent[],
  totalsByEventId: Map<string, number>,
  bulk: BulkData,
): GridCell[] {
  const day = dayForRow(row);
  if (day == null) return [];
  const otherType = myType === "ctp_front" ? "ctp_back" : "ctp_front";

  // Prefer matching by winner_source/day; fall back to label parsing for
  // rows that haven't been backfilled yet.
  const sibling = allRows.find((e) => {
    if (e.id === row.id) return false;
    if (dayForRow(e) !== day) return false;
    if (e.winner_source) return e.winner_source === otherType;
    const lbl = e.label.toLowerCase();
    if (!(lbl.includes("ctp") || lbl.includes("par 3") || lbl.includes("closest"))) return false;
    return myType === "ctp_front" ? lbl.includes("back") : !lbl.includes("back");
  });
  const siblingTotal = sibling ? (totalsByEventId.get(sibling.id) || 0) : 0;
  const dailyPot = total + siblingTotal;

  const dayWinners = bulk.dailyWinners.get(day);
  if (!dayWinners) return [];
  const myWinner = dayWinners.get(myType);
  if (!myWinner) return [];
  const siblingWinner = dayWinners.get(otherType);
  const cellAmount = siblingWinner ? total : dailyPot;
  return [{ user_id: myWinner, event_key: row.id, amount: Math.round(cellAmount * 100) / 100, paid: false }];
}

function cellsForLongDriveOrPutt(
  row: PayoutSheetEvent,
  total: number,
  type: "long_drive" | "long_putt",
  bulk: BulkData,
): GridCell[] {
  const day = dayForRow(row);
  if (day == null) return [];
  const dayWinners = bulk.dailyWinners.get(day);
  if (!dayWinners) return [];
  const winner = dayWinners.get(type);
  if (!winner) return [];
  return [{ user_id: winner, event_key: row.id, amount: total, paid: false }];
}

function cellsForHundredFeet(
  row: PayoutSheetEvent,
  total: number,
  bulk: BulkData,
): GridCell[] {
  if (!bulk.hundredFeetWinner) return [];
  return [{ user_id: bulk.hundredFeetWinner, event_key: row.id, amount: total, paid: false }];
}

function cellsForPickem(row: PayoutSheetEvent, bulk: BulkData): GridCell[] {
  if (!bulk.pickemSettings || bulk.pickemPaidUsers.size === 0) return [];
  const cells: GridCell[] = [];
  for (const p of bulk.pickemSettings.payout_json || []) {
    const winner = bulk.pickemRanked[p.place - 1];
    if (!winner) continue;
    const amt =
      p.amount != null
        ? Number(p.amount)
        : Math.round((((Number(p.percentage) || 0) / 100) * bulk.pickemPot) / 5) * 5;
    if (amt <= 0) continue;
    cells.push({ user_id: winner, event_key: row.id, amount: amt, paid: false });
  }
  return cells;
}

// ── Main ─────────────────────────────────────────────────────────────────

export async function loadPayoutGrid(client: Client, tripId: string): Promise<GridData> {
  // Phase 1: roster + events config in parallel.
  const [{ data: rosterRows }, { data: events }] = await Promise.all([
    client
      .from("event_participants")
      .select("user_id, user:users!user_id(id, display_name, avatar_url, is_system, is_financial_only)")
      .eq("trip_id", tripId)
      .eq("on_roster", true),
    client
      .from("payout_sheet_events")
      .select("*, cost_item:cost_items(cost)")
      .eq("trip_id", tripId)
      .eq("is_payout", true)
      .order("sort_order"),
  ]);

  const loozers: GridLoozer[] = [];
  for (const r of rosterRows || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = Array.isArray((r as any).user) ? (r as any).user[0] : (r as any).user;
    if (!u || u.is_system || u.is_financial_only) continue;
    loozers.push({ user_id: u.id, display_name: u.display_name, avatar_url: u.avatar_url });
  }
  loozers.sort((a, b) => a.display_name.localeCompare(b.display_name));

  if (!events || events.length === 0) {
    return { loozers, events: [], cells: [] };
  }

  // Overlay each row's amount_per_participant with the linked cost_item.cost
  // when set. Mirrors the same fallback logic loadPayoutSheet uses, so all
  // downstream pot math derives from cost_items.
  const eventList: PayoutSheetEvent[] = (events as Array<PayoutSheetEvent & { cost_item?: { cost: number | string } | Array<{ cost: number | string }> | null }>).map((e) => {
    const joined = e.cost_item;
    const item = Array.isArray(joined) ? joined[0] : joined;
    if (item && item.cost != null) {
      return { ...e, amount_per_participant: Number(item.cost) };
    }
    return e;
  });

  // Identify resource ids needed for bulk fetches.
  const scrambleContestIds = new Set<string>();
  const pickemContestIds = new Set<string>();
  for (const e of eventList) {
    if (e.participant_source === "scramble" && e.source_ref) scrambleContestIds.add(e.source_ref);
    if (e.participant_source === "pickem_payments" && e.source_ref) pickemContestIds.add(e.source_ref);
  }
  const pickemContestId = [...pickemContestIds][0] || null;

  // Phase 2: bulk-fetch everything else in parallel.
  const [
    participantCounts,
    scrambleTeamsRes,
    scrambleHoleScoresRes,
    scrambleHoleTeesRes,
    dailyWinnersRes,
    hundredFeetRes,
    pickemSettingsRes,
    pickemPaymentsRes,
    pickemGamesRes,
    paidStatusRes,
    pickemPayoutsRes,
  ] = await Promise.all([
    fetchParticipantCounts(client, tripId, eventList),
    scrambleContestIds.size > 0
      ? client
          .from("scramble_teams")
          .select(`id, contest_id, gross_score, team_handicap, members:scramble_team_members(user_id)`)
          .in("contest_id", [...scrambleContestIds])
      : Promise.resolve({ data: [] }),
    scrambleContestIds.size > 0
      ? client
          .from("scramble_hole_scores")
          .select("team_id, hole_number, strokes, team:scramble_teams!team_id(contest_id)")
          .eq("team.contest_id" as never, "")
          // The above join filter doesn't work cleanly via PostgREST;
          // refilter to scramble contests via in() on team_id below.
      : Promise.resolve({ data: [] }),
    scrambleContestIds.size > 0
      ? client
          .from("contest_hole_tees")
          .select(`contest_id, hole_number, handicap_index_override, tee:course_tees(holes:course_holes(hole_number, handicap_index))`)
          .in("contest_id", [...scrambleContestIds])
      : Promise.resolve({ data: [] }),
    client
      .from("daily_contest_winners")
      .select("day_number, contest_type, user_id")
      .eq("trip_id", tripId),
    client
      .from("hundred_feet_scores")
      .select("user_id, feet, inches")
      .eq("trip_id", tripId),
    pickemContestId
      ? client
          .from("pickem_settings")
          .select("entry_fee, payout_json")
          .eq("contest_id", pickemContestId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    pickemContestId
      ? client
          .from("pickem_payments")
          .select("user_id")
          .eq("contest_id", pickemContestId)
          .eq("paid", true)
      : Promise.resolve({ data: [] }),
    pickemContestId
      ? client
          .from("pickem_games")
          .select("id, winning_team, is_tiebreaker, away_score, home_score")
          .eq("contest_id", pickemContestId)
      : Promise.resolve({ data: [] }),
    client.from("payout_paid_status").select("user_id, cell_key, paid").eq("trip_id", tripId),
    pickemContestIds.size > 0
      ? client
          .from("pickem_payouts")
          .select("user_id, contest_id, paid_out")
          .in("contest_id", [...pickemContestIds])
      : Promise.resolve({ data: [] }),
  ]);

  // Build BulkData maps.
  const scrambleTeams = new Map<string, Array<{ id: string; gross_score: number | null; team_handicap: number; members: Array<{ user_id: string }> }>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teamRows = (scrambleTeamsRes as any).data || [];
  for (const t of teamRows) {
    const arr = scrambleTeams.get(t.contest_id) || [];
    const members = ((t.members as Array<{ user_id: string }>) || []).filter(Boolean);
    arr.push({ id: t.id, gross_score: t.gross_score, team_handicap: Number(t.team_handicap) || 0, members });
    scrambleTeams.set(t.contest_id, arr);
  }

  // Hole scores: we need a second query if we want to filter properly. The
  // first attempt above doesn't actually filter. Refetch by team_ids when we
  // have the team list.
  const allTeamIds = teamRows.map((t: { id: string }) => t.id);
  let holeScoreRows: Array<{ team_id: string; hole_number: number; strokes: number }> = [];
  if (allTeamIds.length > 0) {
    const r = await client
      .from("scramble_hole_scores")
      .select("team_id, hole_number, strokes")
      .in("team_id", allTeamIds);
    holeScoreRows = (r.data as typeof holeScoreRows) || [];
  }
  // Suppress unused-var lint for the placeholder fetch above.
  void scrambleHoleScoresRes;

  // Hole scores by contest_id → team_id → hole → strokes
  const teamToContest = new Map<string, string>();
  for (const t of teamRows) teamToContest.set(t.id, t.contest_id);
  const scrambleHoleScores = new Map<string, Record<string, Record<number, number>>>();
  for (const s of holeScoreRows) {
    const cid = teamToContest.get(s.team_id);
    if (!cid) continue;
    if (!scrambleHoleScores.has(cid)) scrambleHoleScores.set(cid, {});
    const byTeam = scrambleHoleScores.get(cid)!;
    if (!byTeam[s.team_id]) byTeam[s.team_id] = {};
    byTeam[s.team_id][s.hole_number] = s.strokes;
  }

  // Tees → holes per contest
  const scrambleHoles = new Map<string, Array<{ hole_number: number; handicap_index: number }>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teeRows = (scrambleHoleTeesRes as any).data || [];
  // Group by contest_id
  const teeByContest = new Map<string, typeof teeRows>();
  for (const ta of teeRows) {
    const arr = teeByContest.get(ta.contest_id) || [];
    arr.push(ta);
    teeByContest.set(ta.contest_id, arr);
  }
  for (const [cid, rows] of teeByContest) {
    const overridesActive =
      rows.length === 18 &&
      rows.every(
        (r: { handicap_index_override?: number | null }) =>
          typeof r.handicap_index_override === "number",
      );
    const holes: Array<{ hole_number: number; handicap_index: number }> = [];
    for (const ta of rows) {
      const tee = Array.isArray(ta.tee) ? ta.tee[0] : ta.tee;
      if (!tee) continue;
      const teeHoles = (tee.holes || []) as Array<{ hole_number: number; handicap_index: number }>;
      const holeData = teeHoles.find((h) => h.hole_number === ta.hole_number);
      if (holeData) {
        const ov = (ta as { handicap_index_override?: number | null }).handicap_index_override;
        holes.push({
          hole_number: ta.hole_number,
          handicap_index:
            overridesActive && typeof ov === "number" ? ov : holeData.handicap_index,
        });
      }
    }
    scrambleHoles.set(cid, holes);
  }

  // Daily winners: { day_number → { contest_type → user_id } }
  const dailyWinners = new Map<number, Map<string, string>>();
  for (const w of (dailyWinnersRes.data as Array<{ day_number: number; contest_type: string; user_id: string }> | null) || []) {
    if (!dailyWinners.has(w.day_number)) dailyWinners.set(w.day_number, new Map());
    dailyWinners.get(w.day_number)!.set(w.contest_type, w.user_id);
  }

  // Hundred-feet: lowest cumulative inches per user
  const hfTotals = new Map<string, number>();
  for (const s of (hundredFeetRes.data as Array<{ user_id: string; feet: number; inches: number }> | null) || []) {
    const inches = (Number(s.feet) || 0) * 12 + (Number(s.inches) || 0);
    hfTotals.set(s.user_id, (hfTotals.get(s.user_id) || 0) + inches);
  }
  let hundredFeetWinner: string | null = null;
  let bestInches = Infinity;
  for (const [uid, total] of hfTotals) {
    if (total < bestInches) {
      bestInches = total;
      hundredFeetWinner = uid;
    }
  }

  // Pickem rankings (only if we have the pieces)
  const pickemSettings = (pickemSettingsRes as { data: { entry_fee: number; payout_json: Array<{ place: number; percentage?: number; amount?: number }> } | null }).data;
  const pickemPaidUsers = new Set(
    ((pickemPaymentsRes as { data: Array<{ user_id: string }> | null }).data || []).map((p) => p.user_id),
  );
  const pickemGames = ((pickemGamesRes as { data: Array<{ id: string; winning_team: string | null; is_tiebreaker: boolean; away_score: number | null; home_score: number | null }> | null }).data) || [];
  let pickemRanked: string[] = [];
  let pickemPot = 0;
  if (pickemSettings && pickemPaidUsers.size > 0 && pickemGames.length > 0) {
    const decided = pickemGames.filter((g) => g.winning_team);
    if (decided.length > 0) {
      const decidedIds = new Set(decided.map((g) => g.id));
      const tiebreakerGame = pickemGames.find((g) => g.is_tiebreaker);
      const tiebreakerActual =
        tiebreakerGame && tiebreakerGame.away_score != null && tiebreakerGame.home_score != null
          ? tiebreakerGame.away_score + tiebreakerGame.home_score
          : null;
      const { data: picks } = await client
        .from("pickem_picks")
        .select("game_id, user_id, picked_team, tiebreaker_total")
        .in("game_id", [...decidedIds]);
      const correctBy = new Map<string, number>();
      const tiebreakBy = new Map<string, number | null>();
      for (const p of (picks as Array<{ game_id: string; user_id: string; picked_team: string; tiebreaker_total: number | null }> | null) || []) {
        const game = decided.find((g) => g.id === p.game_id);
        if (!game) continue;
        if (game.winning_team === p.picked_team) {
          correctBy.set(p.user_id, (correctBy.get(p.user_id) || 0) + 1);
        }
        if (tiebreakerGame && p.game_id === tiebreakerGame.id) {
          tiebreakBy.set(p.user_id, p.tiebreaker_total ?? null);
        }
      }
      pickemRanked = [...pickemPaidUsers]
        .map((uid) => ({
          user_id: uid,
          correct: correctBy.get(uid) || 0,
          tieDelta:
            tiebreakerActual != null && tiebreakBy.get(uid) != null
              ? Math.abs((tiebreakBy.get(uid) || 0) - tiebreakerActual)
              : Infinity,
        }))
        .sort((a, b) => b.correct - a.correct || a.tieDelta - b.tieDelta)
        .map((r) => r.user_id);
      pickemPot = (Number(pickemSettings.entry_fee) || 0) * pickemPaidUsers.size;
    }
  }

  // Paid lookups
  const paidStatus = new Map<string, boolean>();
  for (const p of (paidStatusRes.data as Array<{ user_id: string; cell_key: string; paid: boolean }> | null) || []) {
    paidStatus.set(`${p.user_id}|${p.cell_key}`, p.paid);
  }
  const pickemContestIdByEventKey = new Map<string, string>();
  for (const e of eventList) {
    if (e.participant_source === "pickem_payments" && e.source_ref) {
      pickemContestIdByEventKey.set(e.id, e.source_ref);
    }
  }
  const pickemPaid = new Map<string, boolean>();
  for (const p of (pickemPayoutsRes.data as Array<{ user_id: string; contest_id: string; paid_out: boolean }> | null) || []) {
    for (const [eventKey, contestId] of pickemContestIdByEventKey) {
      if (contestId === p.contest_id) {
        pickemPaid.set(`${p.user_id}|${eventKey}`, p.paid_out);
      }
    }
  }

  const bulk: BulkData = {
    participantCounts,
    scrambleTeams,
    scrambleHoleScores,
    scrambleHoles,
    dailyWinners,
    hundredFeetWinner,
    pickemSettings,
    pickemPaidUsers,
    pickemRanked,
    pickemPot,
    paidStatus,
    pickemPaid,
  };

  // Compute totals + dispatch handlers (synchronous now).
  const totalsByEventId = new Map<string, number>();
  const gridEvents: GridEvent[] = [];

  const rowsWithMeta: Array<{ row: PayoutSheetEvent; kind: Kind; total: number }> = [];
  for (const row of eventList) {
    const kind = classify(row);
    const count = participantCounts.get(row.id) || 0;
    const total = Math.round(Number(row.amount_per_participant) * count * row.day_count * 100) / 100;
    totalsByEventId.set(row.id, total);
    rowsWithMeta.push({ row, kind, total });
    gridEvents.push({
      key: row.id,
      label: row.label,
      sort_order: row.sort_order,
      is_payout: row.is_payout,
      total,
      pickem: kind === "pickem",
    });
  }

  const allCells: GridCell[] = [];
  for (const { row, kind, total } of rowsWithMeta) {
    let cells: GridCell[] = [];
    switch (kind) {
      case "scramble_team":
        cells = cellsForScrambleTeam(row, total, bulk);
        break;
      case "scramble_skins":
        cells = cellsForScrambleSkins(row, total, bulk);
        break;
      case "ctp_front":
        cells = cellsForCtp(row, total, "ctp_front", eventList, totalsByEventId, bulk);
        break;
      case "ctp_back":
        cells = cellsForCtp(row, total, "ctp_back", eventList, totalsByEventId, bulk);
        break;
      case "long_drive":
        cells = cellsForLongDriveOrPutt(row, total, "long_drive", bulk);
        break;
      case "long_putt":
        cells = cellsForLongDriveOrPutt(row, total, "long_putt", bulk);
        break;
      case "hundred_feet":
        cells = cellsForHundredFeet(row, total, bulk);
        break;
      case "pickem":
        cells = cellsForPickem(row, bulk);
        break;
      case "unknown":
        cells = [];
        break;
    }
    allCells.push(...cells);
  }

  // Overlay paid status.
  const pickemEventKeys = new Set(gridEvents.filter((e) => e.pickem).map((e) => e.key));
  for (const cell of allCells) {
    const k = `${cell.user_id}|${cell.event_key}`;
    cell.paid = pickemEventKeys.has(cell.event_key)
      ? bulk.pickemPaid.get(k) || false
      : bulk.paidStatus.get(k) || false;
  }

  return { loozers, events: gridEvents, cells: allCells };
}
