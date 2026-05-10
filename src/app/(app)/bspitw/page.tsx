import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BspitwContent } from "@/components/BspitwContent";
import { getEffectiveTripId } from "@/lib/simulator";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function BspitwPage() {
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
    <BspitwContent tripId={trip.id} startDate={trip.start_date} scrambleDays={scrambleDays} />
  );
}
