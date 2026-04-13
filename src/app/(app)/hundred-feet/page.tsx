import { createClient, getAuthUser } from "@/lib/supabase/server";
import { HundredFeetContent } from "@/components/HundredFeetContent";
import { getEffectiveDate } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";

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
        <h1 className="text-2xl font-bold text-gray-900">100 Feet</h1>
        <p className="text-gray-500 text-center py-8">100 Feet results will be available once the event begins.</p>
      </div>
    );
  }

  // Get scramble day numbers from contests
  const { data: scrambleContests } = await supabase
    .from("contests")
    .select("day_number")
    .eq("trip_id", trip.id)
    .eq("contest_type", "scramble")
    .not("day_number", "is", null)
    .order("day_number");

  const scrambleDays = [...new Set(
    (scrambleContests || []).map((c) => c.day_number as number)
  )];

  return (
    <HundredFeetContent tripId={trip.id} startDate={trip.start_date} scrambleDays={scrambleDays} />
  );
}
