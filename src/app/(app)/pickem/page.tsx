import { createClient, getAuthUser } from "@/lib/supabase/server";
import { PickemContent } from "@/components/PickemContent";
import { AdminLink } from "@/components/AdminLink";

export default async function PickemPage() {
  const user = await getAuthUser();

  if (!user) return null;

  const supabase = await createClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  // Get pickem contest
  const { data: contest } = await supabase
    .from("contests")
    .select("id, name")
    .eq("trip_id", trip.id)
    .eq("contest_type", "pickem")
    .single();

  if (!contest) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No Pick&apos;em contest found.
      </div>
    );
  }

  // Check if pick'em is open (pickem_settings has SELECT for authenticated)
  const { data: settings } = await supabase
    .from("pickem_settings")
    .select("is_open")
    .eq("contest_id", contest.id)
    .single();

  if (!settings?.is_open) {
    return (
      <div className="px-4 pt-6 pb-8 text-center">
        <div className="mt-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Pick&apos;em Not Open Yet</h2>
          <p className="text-sm text-gray-500">Whitey hasn&apos;t opened the picks yet. Check back soon!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-6 right-4 z-10">
        <AdminLink permissionKey="manage_pickem" href={`/admin/events/${trip.id}/pickem`} />
      </div>
      <PickemContent contestId={contest.id} contestName={contest.name} />
    </div>
  );
}
