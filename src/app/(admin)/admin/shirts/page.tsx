import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ShirtManager } from "@/components/admin/ShirtManager";
import { getEffectiveTripId } from "@/lib/simulator";

export default async function AdminShirtsPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id, trip_name, trip_year")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Shirt Guide</h1>
        <p className="text-gray-500 text-center py-8">No active event found.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Shirt Guide</h1>
        <p className="text-sm text-gray-500">
          {trip.trip_name} {trip.trip_year}
        </p>
      </div>
      <ShirtManager tripId={trip.id} />
    </div>
  );
}
