import { createClient, getAuthUser } from "@/lib/supabase/server";
import OptionSelectionForm from "@/components/OptionSelectionForm";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

export default async function OptionsPage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, trip_name, trip_year")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  // Check if any options exist for this trip
  const { count } = await supabase
    .from("trip_options")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", trip.id);

  if (!count || count === 0) {
    return (
      <div className="px-4 pt-6 pb-8 text-center">
        <div className="mt-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-1">No Options Available Yet</h2>
          <p className="text-sm text-gray-500">Trip options haven&apos;t been set up yet. Check back soon!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">
          {trip.trip_name} {trip.trip_year}
        </h1>
        <PinnedNoteButton pinnedTo="options" />
      </div>
      <p className="text-sm text-gray-500 mb-4">Select your trip options below</p>
      <OptionSelectionForm tripId={trip.id} />
    </div>
  );
}
