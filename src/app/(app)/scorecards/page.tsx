import { createClient, getAuthUser } from "@/lib/supabase/server";
import { ScorecardsContent } from "@/components/ScorecardsContent";

export default async function ScorecardsPage() {
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

  // Get scramble contests (dynamic days from event_days)
  const { data: contests } = await supabase
    .from("contests")
    .select("id, name, day_number")
    .eq("trip_id", trip.id)
    .eq("contest_type", "scramble")
    .order("day_number");

  return (
    <ScorecardsContent
      contests={contests || []}
      startDate={trip.start_date}
    />
  );
}
