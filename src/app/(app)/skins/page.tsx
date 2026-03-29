import { createClient, getAuthUser } from "@/lib/supabase/server";
import { SkinsContent } from "@/components/SkinsContent";

export default async function SkinsPage() {
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

  // Get scramble contests for days 2-4
  const { data: contests } = await supabase
    .from("contests")
    .select("id, name, day_number")
    .eq("trip_id", trip.id)
    .eq("contest_type", "scramble")
    .in("day_number", [2, 3, 4])
    .order("day_number");

  return (
    <SkinsContent
      contests={contests || []}
      startDate={trip.start_date}
    />
  );
}
