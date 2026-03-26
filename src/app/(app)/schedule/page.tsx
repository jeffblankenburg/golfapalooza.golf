import { createClient } from "@/lib/supabase/server";
import { ScheduleView } from "@/components/ScheduleView";

export default async function SchedulePage() {
  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <p className="text-gray-500 text-center py-8">
          Schedule hasn&apos;t been set up yet.
        </p>
      </div>
    );
  }

  const { data: items } = await supabase
    .from("itinerary_items")
    .select("id, title, location, day_number, start_date, start_time, end_date, end_time")
    .eq("trip_id", trip.id)
    .order("day_number", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  return <ScheduleView items={items || []} startDate={trip.start_date} />;
}
