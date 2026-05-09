import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/financials/cost-items/links:
 *   get:
 *     summary: All cost-item ↔ choice junction rows for a trip's cost items
 *     tags: [Admin]
 *     description: |
 *       Returns every row in cost_item_option_choices whose cost_item belongs
 *       to the given trip. Used by the cost-item link modal in OptionBuilder
 *       so it can render existing links without N+1 queries.
 */
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  let tripId = url.searchParams.get("trip_id");
  const adminClient = createAdminClient();

  if (!tripId) {
    const { data: active } = await adminClient
      .from("trip_settings")
      .select("id")
      .eq("status", "active")
      .single();
    tripId = active?.id ?? null;
  }
  if (!tripId) {
    return NextResponse.json({ error: "No active trip" }, { status: 400 });
  }

  // Fetch all cost item ids for the trip, then their junction rows in one go.
  const { data: items } = await adminClient
    .from("cost_items")
    .select("id")
    .eq("trip_id", tripId);
  const itemIds = (items || []).map((i) => i.id);
  if (itemIds.length === 0) return NextResponse.json({ junction: [] });

  const { data: junction, error } = await adminClient
    .from("cost_item_option_choices")
    .select("cost_item_id, choice_value")
    .in("cost_item_id", itemIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ junction: junction || [] });
}
