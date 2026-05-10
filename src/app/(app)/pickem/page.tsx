import Link from "next/link";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { PickemContent } from "@/components/PickemContent";
import { AdminLink } from "@/components/AdminLink";
import { PickemHeader } from "@/components/pickem/PickemHeader";
import { getEffectiveTripId } from "@/lib/simulator";

function HomeButton() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 active:bg-gray-200 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Home
    </Link>
  );
}

function EmptyState({ headerAction, message }: { headerAction?: React.ReactNode; message: string }) {
  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <HomeButton />
        {headerAction}
      </div>
      <div className="text-center">
        <PickemHeader size={280} />
        <p className="text-gray-500 text-sm mt-4">{message}</p>
      </div>
    </div>
  );
}

export default async function PickemPage() {
  const user = await getAuthUser();

  if (!user) return null;

  const supabase = await createClient();

  // Get active trip
  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return <EmptyState message="No active event found." />;
  }

  const adminLink = (
    <AdminLink permissionKey="manage_pickem" href={`/admin/events/${trip.id}/pickem`} />
  );

  // Get pickem contest
  const { data: contest } = await supabase
    .from("contests")
    .select("id, name")
    .eq("trip_id", trip.id)
    .eq("contest_type", "pickem")
    .single();

  if (!contest) {
    return <EmptyState headerAction={adminLink} message="No Pick'em contest found." />;
  }

  // Check if pick'em is open (pickem_settings has SELECT for authenticated)
  const { data: settings } = await supabase
    .from("pickem_settings")
    .select("is_open")
    .eq("contest_id", contest.id)
    .single();

  if (!settings?.is_open) {
    return (
      <EmptyState
        headerAction={adminLink}
        message="Whitey hasn't opened the picks yet. Check back soon!"
      />
    );
  }

  return <PickemContent contestId={contest.id} headerAction={adminLink} />;
}
