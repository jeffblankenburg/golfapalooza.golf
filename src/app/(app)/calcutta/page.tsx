import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { CalcuttaResults } from "@/components/calcutta/CalcuttaResults";

export default async function CalcuttaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminClient = createAdminClient();
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Calcutta</h1>
        <p className="text-gray-500 text-center py-8">No active event.</p>
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
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Calcutta</h1>
        <p className="text-gray-500 text-center py-8">No Calcutta contest set up yet.</p>
      </div>
    );
  }

  return <CalcuttaResults contestId={contest.id} />;
}
