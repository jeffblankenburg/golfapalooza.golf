import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveFoursomes } from "@/lib/kgb-cup/derive-foursomes";

// The Boland Bet is a side bet keyed entirely off each opted-in player's
// individual gross score on Hole #1 of the KGB Cup:
//   • par or better  → the player wins $10
//   • bogey or worse → Boland keeps their $10 bet
// Balances are shown from the players' perspective (positive = players up on
// Boland). The bet is opted into on the /options page like any other option.
const WIN_AMOUNT = 10; // par or better
const LOSS_AMOUNT = 10; // bogey or worse (Boland keeps the bet)

export type BolandBetResult = "win" | "loss" | "pending";

export type BolandBetLine = {
  userId: string;
  displayName: string;
  score: number | null; // gross strokes on Hole #1, null until scored
  result: BolandBetResult;
  balance: number; // +WIN_AMOUNT / -LOSS_AMOUNT / 0 while pending
  paid: boolean; // Boland has paid this winner (only meaningful for wins)
};

export type BolandBet = {
  optionName: string;
  par: number | null;
  lines: BolandBetLine[];
  total: number;
};

// Mirrors the option-completeness truthiness used elsewhere on the home page:
// a checkbox opt-in is `true`, but tolerate select/string/array shapes too.
function isOptedIn(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

/**
 * Loads the Boland Bet standings for the active trip, or null when there's
 * nothing to show (no Boland Bet option, or nobody opted in). Must be called
 * with an admin client — it reads every opted-in player's selection and score,
 * which RLS would otherwise hide from a regular Loozer.
 */
export async function getBolandBet(
  admin: SupabaseClient,
  trip: { id: string; course_id: string | null }
): Promise<BolandBet | null> {
  // 1. Find the Boland Bet option among this trip's /options entries.
  const { data: optionRows } = await admin
    .from("trip_options")
    .select("id, name")
    .eq("trip_id", trip.id)
    .ilike("name", "%boland%")
    .limit(1);
  const option = (optionRows || [])[0];
  if (!option) return null;

  // 2. Who opted in.
  const { data: selections } = await admin
    .from("user_option_selections")
    .select("user_id, value")
    .eq("trip_id", trip.id)
    .eq("option_id", option.id);

  const optedInIds = [
    ...new Set(
      (selections || [])
        .filter((s) => isOptedIn(s.value))
        .map((s) => s.user_id as string)
    ),
  ];
  if (optedInIds.length === 0) return null;

  // 3. Display names for the opted-in players.
  const { data: userRows } = await admin
    .from("users")
    .select("id, display_name")
    .in("id", optedInIds);
  const nameById = new Map(
    (userRows || []).map((u) => [u.id as string, (u.display_name as string) || "Loozer"])
  );

  // 3b. Which winners Boland has already paid (presence of a row = paid).
  const { data: paymentRows } = await admin
    .from("boland_bet_payments")
    .select("user_id")
    .eq("trip_id", trip.id);
  const paidIds = new Set((paymentRows || []).map((p) => p.user_id as string));

  // 4. The first (earliest-day) KGB Cup / ryder_cup contest.
  const { data: contests } = await admin
    .from("contests")
    .select("id, day_number")
    .eq("trip_id", trip.id)
    .eq("contest_type", "ryder_cup")
    .order("day_number", { ascending: true, nullsFirst: true });
  const contest = (contests || [])[0];

  // 5. Hole #1 par + each opted-in player's gross score (only once a KGB Cup
  //    contest exists; before that everyone stays "pending").
  let par: number | null = null;
  const scoreByUser = new Map<string, number>();

  if (contest) {
    if (trip.course_id) {
      const { data: teeAssign } = await admin
        .from("contest_hole_tees")
        .select("tee_id")
        .eq("contest_id", contest.id)
        .eq("hole_number", 1)
        .maybeSingle();
      if (teeAssign?.tee_id) {
        const { data: hole } = await admin
          .from("course_holes")
          .select("par")
          .eq("course_id", trip.course_id)
          .eq("tee_id", teeAssign.tee_id)
          .eq("hole_number", 1)
          .maybeSingle();
        par = hole?.par ?? null;
      }
    }

    // Read Hole #1 scores the SAME way the admin scoring grid renders them:
    // scoped to the foursome each player currently belongs to. A player's
    // score row (foursome_id = derived foursome = team-1 pair id) only counts
    // if that player is a current member of that foursome's pairs. This ignores
    // orphaned rows left behind when a player was moved between pairs/foursomes
    // — those are invisible in the (foursome-scoped) admin grid, so counting
    // them here would show a score the admin can't see or clear.
    const { data: teams } = await admin
      .from("ryder_cup_teams")
      .select("id, team_number")
      .eq("contest_id", contest.id);
    const teamIds = (teams || []).map((t) => t.id as string);

    if (teamIds.length > 0) {
      const { data: pairs } = await admin
        .from("ryder_cup_pairs")
        .select("id, team_id, sort_order, player_a_id, player_b_id, player_c_id")
        .in("team_id", teamIds);
      const foursomes = deriveFoursomes(pairs || [], teams || []);
      const foursomeIds = foursomes.map((f) => f.id);

      // Map each current player → the foursome they belong to.
      const pairById = new Map((pairs || []).map((p) => [p.id as string, p]));
      const foursomeByPlayer = new Map<string, string>();
      for (const f of foursomes) {
        for (const pairId of [f.pair_team1_id, f.pair_team2_id]) {
          const p = pairById.get(pairId);
          if (!p) continue;
          for (const memberId of [p.player_a_id, p.player_b_id, p.player_c_id]) {
            if (memberId) foursomeByPlayer.set(memberId as string, f.id);
          }
        }
      }

      if (foursomeIds.length > 0) {
        const { data: scores } = await admin
          .from("kgb_cup_hole_scores")
          .select("foursome_id, scorer_id, strokes")
          .in("foursome_id", foursomeIds)
          .eq("hole_number", 1)
          .eq("scorer_type", "player");
        for (const s of scores || []) {
          // Only count a score stored under the player's current foursome.
          if (foursomeByPlayer.get(s.scorer_id as string) === s.foursome_id) {
            scoreByUser.set(s.scorer_id as string, s.strokes as number);
          }
        }
      }
    }
  }

  // 6. Build one line per opted-in player.
  const lines: BolandBetLine[] = optedInIds.map((uid) => {
    const score = scoreByUser.get(uid) ?? null;
    let result: BolandBetResult = "pending";
    let balance = 0;
    if (score !== null && par !== null) {
      if (score <= par) {
        result = "win";
        balance = WIN_AMOUNT;
      } else {
        result = "loss";
        balance = -LOSS_AMOUNT;
      }
    }
    return {
      userId: uid,
      displayName: nameById.get(uid) || "Loozer",
      score,
      result,
      balance,
      paid: paidIds.has(uid),
    };
  });

  // Wins first, then losses, then still-to-play — each group alphabetical.
  const rank: Record<BolandBetResult, number> = { win: 0, loss: 1, pending: 2 };
  lines.sort(
    (a, b) => rank[a.result] - rank[b.result] || a.displayName.localeCompare(b.displayName)
  );

  const total = lines.reduce((sum, l) => sum + l.balance, 0);

  return { optionName: option.name || "Boland Bet", par, lines, total };
}

/**
 * True when the given user is Pat Boland — the only person allowed to mark
 * winners paid. Identified by display name (there's exactly one Boland), matched
 * with an admin client so RLS can't hide the row. Pass a simulator-effective id.
 */
export async function isBolandUser(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .ilike("display_name", "%boland%")
    .maybeSingle();
  return !!data;
}
