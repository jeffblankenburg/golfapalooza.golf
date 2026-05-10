import { createAdminClient } from "@/lib/supabase/admin";
import { CornholeBrackets } from "@/components/CornholeBrackets";
import { getEffectiveTripId } from "@/lib/simulator";

export default async function SpectatorCornholePage() {
  const adminClient = createAdminClient();

  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("id", (await getEffectiveTripId())!)
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
    .select("id, contest_type")
    .eq("trip_id", trip.id)
    .in("contest_type", ["cornhole_singles", "cornhole_doubles"]);

  const singlesContestId =
    contests?.find((c) => c.contest_type === "cornhole_singles")?.id || null;
  const doublesContestId =
    contests?.find((c) => c.contest_type === "cornhole_doubles")?.id || null;

  return (
    <CornholeBrackets
      singlesContestId={singlesContestId}
      doublesContestId={doublesContestId}
    />
  );
}
