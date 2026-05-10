import { createClient, getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScorecardsContent } from "@/components/ScorecardsContent";
import { loadPayoutSheet } from "@/lib/payout-events/compute";
import { computePayoutSplits } from "@/lib/payout-events/splits";
import { getEffectiveTripId } from "@/lib/simulator";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function ScorecardsPage() {
  const user = await getAuthUser();

  if (!user) return null;

  const supabase = await createClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  // Get scramble contests (dynamic days from event_days)
  const { data: contests } = await supabase
    .from("contests")
    .select("id, name, day_number, scoring_closed_at, verified_at")
    .eq("trip_id", trip.id)
    .eq("contest_type", "scramble")
    .order("day_number");

  // Per-day scramble Team payout. Pot total = row.total; per-place
  // amounts come from the contest's admin-configured payout_splits
  // (default: 1st = remainder, 2nd = flat $80). Skins/CTP/LD/LP live
  // on different contest types; we filter to scramble Team specifically.
  const adminClient = createAdminClient();
  const allPayoutRows = await loadPayoutSheet(adminClient, trip.id);
  const dayScramblePayouts: Record<number, { pot: number; first: number; second: number }> = {};
  for (const row of allPayoutRows) {
    if (row.contest?.contest_type !== "scramble") continue;
    const day = row.contest.day_number;
    if (day == null) continue;
    const splits = computePayoutSplits(row.total, row.payout_splits);
    dayScramblePayouts[day] = {
      pot: row.total,
      first: splits.get(1) ?? 0,
      second: splits.get(2) ?? 0,
    };
  }

  return (
    <ScorecardsContent
      contests={contests || []}
      startDate={trip.start_date}
      dayScramblePayouts={dayScramblePayouts}
    />
  );
}
