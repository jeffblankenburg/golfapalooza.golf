import { createClient } from "@/lib/supabase/server";
import { SimulatorControls } from "@/components/admin/SimulatorControls";
import { getSimUserId, getEffectiveTripId } from "@/lib/simulator";

export default async function SimulatorPage() {
  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  const [usersResult, eventDaysResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, display_name")
      .eq("is_financial_only", false)
      .eq("is_active", true)
      .order("display_name"),
    trip
      ? supabase
          .from("event_days")
          .select("day_number, name")
          .eq("trip_id", trip.id)
          .order("day_number")
      : Promise.resolve({ data: null }),
  ]);

  const users = usersResult.data;
  const eventDays = (eventDaysResult.data || []) as { day_number: number; name: string }[];

  const simUserId = await getSimUserId();

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Simulator</h1>
      <SimulatorControls
        users={users || []}
        tripStartDate={trip?.start_date || null}
        currentSimUserId={simUserId}
        eventDays={eventDays}
      />
    </div>
  );
}
