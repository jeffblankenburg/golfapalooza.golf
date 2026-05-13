import { createClient, getAuthUser } from "@/lib/supabase/server";
import { HundredFeetContent } from "@/components/HundredFeetContent";
import { getEffectiveDate, getEffectiveTripId } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";
import { AdminLink } from "@/components/AdminLink";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function HundredFeetPage() {
  const user = await getAuthUser();

  if (!user) return null;

  const supabase = await createClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date, visibility_overrides")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  const now = await getEffectiveDate();
  const featureVisible = isFeatureVisible(
    "hundred_feet",
    { start_date: trip.start_date, visibility_overrides: (trip.visibility_overrides as Record<string, boolean>) || {} },
    now,
  );

  // Get scramble day numbers + the 100 Feet contest's materialized winner
  // (issue #122 — display the per-winner payout amount on the leaderboard).
  // Also pull the buy-in cost + participant count so we can show the prize
  // pool pre-event, before any winner row exists.
  const [scrambleContestsResult, hundredFeetContestResult] = await Promise.all([
    supabase
      .from("contests")
      .select("day_number")
      .eq("trip_id", trip.id)
      .eq("contest_type", "scramble")
      .not("day_number", "is", null)
      .order("day_number"),
    supabase
      .from("contests")
      .select("id, contest_winners(user_id, amount), buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost)")
      .eq("trip_id", trip.id)
      .eq("name", "100 Feet!")
      .eq("contest_type", "other")
      .maybeSingle(),
  ]);

  const scrambleDays = [...new Set(
    (scrambleContestsResult.data || []).map((c) => c.day_number as number)
  )];

  const hfContest = hundredFeetContestResult.data;
  const hfWinner = (hfContest?.contest_winners ?? [])[0] as
    | { user_id: string; amount: number | string | null }
    | undefined;
  const winnerUserId = hfWinner?.user_id ?? null;

  let payoutAmount = hfWinner ? Number(hfWinner.amount ?? 0) : 0;
  if (!payoutAmount && hfContest?.id) {
    const costItem = Array.isArray(hfContest.buy_in_cost_item)
      ? hfContest.buy_in_cost_item[0]
      : hfContest.buy_in_cost_item;
    const perPerson = Number((costItem as { cost?: number | string } | null)?.cost ?? 0);
    if (perPerson > 0) {
      const { count } = await supabase
        .from("contest_participants")
        .select("id", { count: "exact", head: true })
        .eq("contest_id", hfContest.id);
      payoutAmount = Math.round(perPerson * (count ?? 0) * 100) / 100;
    }
  }

  return (
    <HundredFeetContent
      tripId={trip.id}
      startDate={trip.start_date}
      scrambleDays={scrambleDays}
      winnerUserId={winnerUserId}
      payoutAmount={payoutAmount}
      featureVisible={featureVisible}
      headerAction={<AdminLink permissionKey="manage_scrambles" href={`/admin/events/${trip.id}/hundred-feet`} />}
    />
  );
}
