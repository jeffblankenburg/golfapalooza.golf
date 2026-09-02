import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveTripId, getEffectiveUserId } from "@/lib/simulator";
import { getBolandBet, isBolandUser } from "@/lib/boland-bet/compute";
import { BolandBetLive } from "./BolandBetLive";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function BolandBetPage() {
  const user = await getAuthUser();
  const admin = createAdminClient();

  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, course_id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  const [bet, viewerIsBoland] = await Promise.all([
    trip ? getBolandBet(admin, trip) : Promise.resolve(null),
    user ? isBolandUser(admin, await getEffectiveUserId(user.id)) : Promise.resolve(false),
  ]);

  return <BolandBetLive initialBet={bet} initialViewerIsBoland={viewerIsBoland} />;
}
