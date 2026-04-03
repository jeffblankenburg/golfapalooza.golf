import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("notebook_notes")
    .select("*, category:notebook_categories(id, name, sort_order)")
    .eq("trip_id", tripId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: data || [] });
}

export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trip_id, category_id, title, content, sort_order, pinned_to } = await request.json();
  if (!trip_id || !category_id || !title) {
    return NextResponse.json({ error: "trip_id, category_id, and title are required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Auto sort_order if not provided
  let order = sort_order;
  if (order === undefined) {
    const { data: existing } = await adminClient
      .from("notebook_notes")
      .select("sort_order")
      .eq("category_id", category_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    order = (existing?.[0]?.sort_order ?? -1) + 1;
  }

  const { data, error } = await adminClient
    .from("notebook_notes")
    .insert({
      trip_id,
      category_id,
      title,
      content: content || "",
      sort_order: order,
      pinned_to: pinned_to || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, category_id, title, content, sort_order, pinned_to } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (category_id !== undefined) updates.category_id = category_id;
  if (title !== undefined) updates.title = title;
  if (content !== undefined) updates.content = content;
  if (sort_order !== undefined) updates.sort_order = sort_order;
  if (pinned_to !== undefined) updates.pinned_to = pinned_to || null;

  const { error } = await adminClient
    .from("notebook_notes")
    .update(updates)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("notebook_notes")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
