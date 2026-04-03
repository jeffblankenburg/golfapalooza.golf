import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("option_groups")
    .select("*")
    .eq("trip_id", tripId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ groups: data || [] });
}

export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trip_id, name, description, icon, sort_order } = await request.json();
  if (!trip_id || !name) return NextResponse.json({ error: "trip_id and name are required" }, { status: 400 });

  const adminClient = createAdminClient();

  // Auto sort_order if not provided
  let order = sort_order;
  if (order === undefined) {
    const { data: existing } = await adminClient
      .from("option_groups")
      .select("sort_order")
      .eq("trip_id", trip_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    order = (existing?.[0]?.sort_order ?? -1) + 1;
  }

  const insert: Record<string, unknown> = { trip_id, name, sort_order: order };
  if (description !== undefined) insert.description = description;
  if (icon !== undefined) insert.icon = icon;

  const { data, error } = await adminClient
    .from("option_groups")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ group: data });
}

export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, description, icon, sort_order } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (icon !== undefined) updates.icon = icon;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { error } = await adminClient
    .from("option_groups")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("option_groups")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
