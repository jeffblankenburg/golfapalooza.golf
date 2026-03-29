import { createClient, getAuthUser } from "@/lib/supabase/server";
import { BspitwContent } from "@/components/BspitwContent";

export default async function BspitwPage() {
  const user = await getAuthUser();

  if (!user) return null;

  const supabase = await createClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  return (
    <BspitwContent tripId={trip.id} startDate={trip.start_date} />
  );
}
