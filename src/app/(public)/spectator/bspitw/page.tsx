import { createAdminClient } from "@/lib/supabase/admin";
import { BspitwContent } from "@/components/BspitwContent";
import { getEffectiveTripId } from "@/lib/simulator";

export default async function SpectatorBspitwPage() {
  const adminClient = createAdminClient();

  const { data: trip } = await adminClient
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

  const { data: scrambleContests } = await adminClient
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
