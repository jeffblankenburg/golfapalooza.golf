import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { CalcuttaDisplay } from "@/components/calcutta/CalcuttaDisplay";
import { getEffectiveTripId } from "@/lib/simulator";

export default async function CalcuttaDisplayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Find the active trip's calcutta contest
  const adminClient = createAdminClient();
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="fixed inset-0 bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-500 text-xl">No active event found.</p>
      </div>
    );
  }

  const { data: contest } = await adminClient
    .from("contests")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("contest_type", "calcutta")
    .single();

  if (!contest) {
    return (
      <div className="fixed inset-0 bg-gray-950 text-white flex items-center justify-center">
        <p className="text-gray-500 text-xl">No Calcutta contest found.</p>
      </div>
    );
  }

  return <CalcuttaDisplay contestId={contest.id} />;
}
