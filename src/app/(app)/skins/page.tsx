import { createClient, getAuthUser } from "@/lib/supabase/server";
import { SkinsContent } from "@/components/SkinsContent";
import { getEffectiveDate, getEffectiveTripId } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function SkinsPage() {
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
  if (!isFeatureVisible("skins", { start_date: trip.start_date, visibility_overrides: (trip.visibility_overrides as Record<string, boolean>) || {} }, now)) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Skins</h1>
        <p className="text-gray-500 text-center py-8">Skins results will be available once the event begins.</p>
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
    <SkinsContent
      contests={contests || []}
      startDate={trip.start_date}
    />
  );
}
