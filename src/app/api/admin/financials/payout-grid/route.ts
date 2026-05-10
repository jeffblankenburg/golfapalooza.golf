import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { loadPayoutGridV2 } from "@/lib/payout-events/grid-v2";
import { getEffectiveTripId } from "@/lib/simulator";

/**
 * @swagger
 * /api/admin/financials/payout-grid:
 *   get:
 *     summary: Loozer × event payout grid for a trip
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Defaults to active trip when omitted.
 *     responses:
 *       200:
 *         description: { loozers, events, cells } — winners read from existing data sources
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  let tripId = url.searchParams.get("trip_id");
  const adminClient = createAdminClient();

  if (!tripId) {
    const { data: active } = await adminClient
      .from("trip_settings")
      .select("id")
      .eq("id", (await getEffectiveTripId())!)
      .single();
    tripId = active?.id ?? null;
  }
  if (!tripId) {
    return NextResponse.json({ error: "No active trip" }, { status: 400 });
  }

  const data = await loadPayoutGridV2(adminClient, tripId);
  return NextResponse.json({ trip_id: tripId, ...data });
}
