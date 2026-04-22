import { createClient, getAuthUser } from "@/lib/supabase/server";
import { CornholeBrackets } from "@/components/CornholeBrackets";
import { AdminLink } from "@/components/AdminLink";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function CornholePage() {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

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

  // Find cornhole contests for this trip
  const { data: contests } = await supabase
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
      headerAction={<AdminLink permissionKey="manage_cornhole" href={`/admin/events/${trip.id}/cornhole`} />}
    />
  );
}
