import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/financials/cost-items/{id}:
 *   put:
 *     summary: Update a cost item
 *     tags: [Admin]
 *   delete:
 *     summary: Delete a cost item
 *     tags: [Admin]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  for (const key of [
    "name",
    "description",
    "cost",
    "category",
    "included_in_trip_cost",
    "sort_order",
    "notes",
    "linked_option_id",
  ]) {
    if (key in body) updates[key] = body[key];
  }

  // Special-case: linked_choices is a separate junction table. When provided,
  // replace the existing rows for this cost_item with the given set.
  const linkedChoices = body.linked_choices as string[] | undefined;

  if (Object.keys(updates).length === 0 && linkedChoices === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  let data = null;
  if (Object.keys(updates).length > 0) {
    const res = await adminClient
      .from("cost_items")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    data = res.data;
  }

  if (linkedChoices !== undefined) {
    // Replace strategy: delete all junction rows for this item, then insert
    // the new set. Two queries — small set, safe to do non-transactionally.
    const { error: delErr } = await adminClient
      .from("cost_item_option_choices")
      .delete()
      .eq("cost_item_id", id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    if (linkedChoices.length > 0) {
      const rows = linkedChoices.map((choice_value) => ({ cost_item_id: id, choice_value }));
      const { error: insErr } = await adminClient
        .from("cost_item_option_choices")
        .insert(rows);
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  // Re-fetch if we only touched junctions and didn't update the item itself
  if (!data) {
    const res = await adminClient.from("cost_items").select("*").eq("id", id).single();
    data = res.data;
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();
  const { error } = await adminClient.from("cost_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
