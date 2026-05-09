import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/financials/cost-items:
 *   get:
 *     summary: List cost items for a trip (admin-only — never shown to Loozers)
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         schema: { type: string, format: uuid }
 *         description: Defaults to active trip when omitted.
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
      .select("id, trip_name")
      .eq("status", "active")
      .single();
    tripId = active?.id ?? null;
  }
  if (!tripId) {
    return NextResponse.json({ error: "No trip_id provided and no active trip" }, { status: 400 });
  }

  const { data, error } = await adminClient
    .from("cost_items")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort_order")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trip_id: tripId, items: data || [] });
}

/**
 * @swagger
 * /api/admin/financials/cost-items:
 *   post:
 *     summary: Create a cost item
 *     tags: [Admin]
 */
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const {
      trip_id,
      name,
      description,
      cost,
      category,
      included_in_trip_cost,
      sort_order,
      notes,
    } = body;

    if (!trip_id || !name) {
      return NextResponse.json({ error: "trip_id and name are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("cost_items")
      .insert({
        trip_id,
        name,
        description: description ?? null,
        cost: cost ?? 0,
        category: category ?? null,
        included_in_trip_cost: included_in_trip_cost ?? false,
        sort_order: sort_order ?? 0,
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: data });
  } catch (err) {
    console.error("Create cost item error:", err);
    return NextResponse.json({ error: "Failed to create cost item" }, { status: 500 });
  }
}
