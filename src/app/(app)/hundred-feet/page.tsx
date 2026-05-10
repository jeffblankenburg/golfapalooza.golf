import { createClient, getAuthUser } from "@/lib/supabase/server";
import { HundredFeetContent } from "@/components/HundredFeetContent";
import { getEffectiveDate } from "@/lib/simulator";
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
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  const now = await getEffectiveDate();
  if (!isFeatureVisible("hundred_feet", { start_date: trip.start_date, visibility_overrides: (trip.visibility_overrides as Record<string, boolean>) || {} }, now)) {
    return (
      <div className="px-4 pt-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">100 Feet</h1>
          <AdminLink permissionKey="manage_scrambles" href={`/admin/events/${trip.id}/hundred-feet`} />
        </div>
        <p className="text-gray-500 text-center py-8">100 Feet results will be available once the event begins.</p>
      </div>
    );
  }

  // Get scramble day numbers + the 100 Feet contest's materialized winner
  // (issue #122 — display the per-winner payout amount on the leaderboard).
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
      .select("contest_winners(user_id, amount)")
      .eq("trip_id", trip.id)
      .eq("name", "100 Feet!")
      .eq("contest_type", "other")
      .maybeSingle(),
  ]);

  const scrambleDays = [...new Set(
    (scrambleContestsResult.data || []).map((c) => c.day_number as number)
  )];

  const hfWinner = (hundredFeetContestResult.data?.contest_winners ?? [])[0] as
    | { user_id: string; amount: number | string | null }
    | undefined;
  const winnerUserId = hfWinner?.user_id ?? null;
  const payoutAmount = hfWinner ? Number(hfWinner.amount ?? 0) : 0;

  return (
    <HundredFeetContent
      tripId={trip.id}
      startDate={trip.start_date}
      scrambleDays={scrambleDays}
      winnerUserId={winnerUserId}
      payoutAmount={payoutAmount}
      headerAction={<AdminLink permissionKey="manage_scrambles" href={`/admin/events/${trip.id}/hundred-feet`} />}
    />
  );
}
