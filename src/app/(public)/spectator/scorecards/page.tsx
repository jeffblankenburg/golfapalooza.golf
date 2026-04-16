import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { ScorecardsContent } from "@/components/ScorecardsContent";

export default async function SpectatorScorecardsPage() {
  const adminClient = createAdminClient();

  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id, start_date")
    .eq("status", "active")
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500">
        No active event found.
      </div>
    );
  }

  const { data: contests } = await adminClient
    .from("contests")
    .select("id, name, day_number, scoring_closed_at, verified_at")
    .eq("trip_id", trip.id)
    .eq("contest_type", "scramble")
    .order("day_number");

  return (
    <Suspense fallback={<div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" /></div>}>
      <ScorecardsContent
        contests={contests || []}
        startDate={trip.start_date}
      />
    </Suspense>
  );
}
