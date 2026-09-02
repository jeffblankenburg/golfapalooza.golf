import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveTripId } from "@/lib/simulator";
import { getBolandBet } from "@/lib/boland-bet/compute";
import { BolandBetLive } from "./BolandBetLive";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function BolandBetPage() {
  await getAuthUser();
  const admin = createAdminClient();

  const { data: trip } = await admin
    .from("trip_settings")
    .select("id, course_id")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  const bet = trip ? await getBolandBet(admin, trip) : null;

  return <BolandBetLive initialBet={bet} />;
}
