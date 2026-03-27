import { createClient } from "@/lib/supabase/server";
import { SimulatorControls } from "@/components/admin/SimulatorControls";
import { getSimDate, getSimUserId } from "@/lib/simulator";

export default async function SimulatorPage() {
  const supabase = await createClient();

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, start_date")
    .eq("status", "active")
    .single();

  const { data: users } = await supabase
    .from("users")
    .select("id, display_name")
    .eq("is_active", true)
    .order("display_name");

  const simDate = await getSimDate();
  const simUserId = await getSimUserId();

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Simulator</h1>
      <SimulatorControls
        users={users || []}
        tripStartDate={trip?.start_date || null}
        currentSimDate={simDate}
        currentSimUserId={simUserId}
      />
    </div>
  );
}
