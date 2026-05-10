/**
 * @swagger
 * /api/admin/sim/scaffold:
 *   post:
 *     summary: Issue #128 — quick-seed the test event with a minimal contest set
 *     description: |
 *       Inserts event_days, contests (scramble × 3, daily contests × 12,
 *       100 Feet, Pickem, Calcutta, Cornhole, KGB Cup), per-hole tee
 *       assignments for scrambles, and cost_items linked as each
 *       contest's buy-in. Idempotent — re-running on a scaffolded test
 *       event is a no-op. Admin auth + sim-mode-active required.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Insertion counts and any warnings }
 *       400: { description: Sim mode not active }
 *       401: { description: Unauthorized }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimTripId } from "@/lib/simulator";
import { scaffoldTestEvent } from "@/lib/sim/scaffold";

async function checkAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  return profile?.is_admin ? user : null;
}

export async function POST() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simTripId = await getSimTripId();
  if (!simTripId) {
    return NextResponse.json(
      { error: "Sim mode is not active. Enter sim mode at /admin/simulator first." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  try {
    const result = await scaffoldTestEvent(admin, simTripId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
