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
    .from("trip_options")
    .select("*, option_groups(id, name, sort_order)")
    .eq("trip_id", tripId)
    .order("sort_order", { referencedTable: "option_groups" })
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ options: data || [] });
}

export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { group_id, trip_id, name, description, option_type, choices, cost, is_required, icon, sort_order } = await request.json();
  if (!group_id || !trip_id || !name || !option_type) {
    return NextResponse.json({ error: "group_id, trip_id, name, and option_type are required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Auto sort_order within group if not provided
  let order = sort_order;
  if (order === undefined) {
    const { data: existing } = await adminClient
      .from("trip_options")
      .select("sort_order")
      .eq("group_id", group_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    order = (existing?.[0]?.sort_order ?? -1) + 1;
  }

  const insert: Record<string, unknown> = { group_id, trip_id, name, option_type, sort_order: order };
  if (description !== undefined) insert.description = description;
  if (choices !== undefined) insert.choices = choices;
  if (cost !== undefined) insert.cost = cost;
  if (is_required !== undefined) insert.is_required = is_required;
  if (icon !== undefined) insert.icon = icon;

  const { data, error } = await adminClient
    .from("trip_options")
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ option: data });
}

export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, name, description, option_type, choices, cost, is_required, icon, sort_order } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (option_type !== undefined) updates.option_type = option_type;
  if (choices !== undefined) updates.choices = choices;
  if (cost !== undefined) updates.cost = cost;
  if (is_required !== undefined) updates.is_required = is_required;
  if (icon !== undefined) updates.icon = icon;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { error } = await adminClient
    .from("trip_options")
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

  // Clean up financial_transactions linked to this option first
  // (option_id FK is ON DELETE CASCADE, but be explicit for clarity)
  const { error: txError } = await adminClient
    .from("financial_transactions")
    .delete()
    .eq("option_id", id)
    .eq("source", "option");

  if (txError) return NextResponse.json({ error: txError.message }, { status: 500 });

  // Delete the option (cascades to user_option_selections via FK)
  const { error: deleteError } = await adminClient
    .from("trip_options")
    .delete()
    .eq("id", id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
